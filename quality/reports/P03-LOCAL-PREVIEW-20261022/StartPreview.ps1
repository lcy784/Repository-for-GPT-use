param([ValidateRange(1024,65535)][int]$Port = 4173, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
try {
    $webRoot = Join-Path $PSScriptRoot 'site'
    $build = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'BUILD.json') -Raw | ConvertFrom-Json
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        foreach ($item in $build.files) {
            $file = Join-Path $webRoot $item.path
            $actual = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($file))).Replace('-', '').ToLowerInvariant()
            if ($actual -ne $item.sha256) { throw ('Build file changed: ' + $item.path) }
        }
        if (@(Get-ChildItem -LiteralPath $webRoot -Recurse -File).Count -ne @($build.files).Count) {
            throw 'Unexpected files in site directory. Extract a fresh copy of the preview ZIP.'
        }
    } finally { $sha.Dispose() }
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Text.RegularExpressions;

namespace Tiangong {
 public sealed class LocalPreviewServer : IDisposable {
  readonly TcpListener listener;
  readonly string root;
  readonly int port;
  readonly byte[] health;
  readonly SemaphoreSlim slots = new SemaphoreSlim(24);
  volatile bool running = true;
  public LocalPreviewServer(string directory, int number, string healthJson) {
   root = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
   port = number;
   health = Encoding.UTF8.GetBytes(healthJson);
   listener = new TcpListener(IPAddress.Loopback, port);
   listener.Server.ExclusiveAddressUse = true;
   listener.Start(64);
  }
  public void Run() {
   while (running) {
    TcpClient client = listener.AcceptTcpClient();
    if (!slots.Wait(0)) { client.Close(); continue; }
    ThreadPool.QueueUserWorkItem(delegate(object unused) {
     try { Serve(client); } catch (IOException) {} catch (SocketException) {}
     finally { client.Close(); slots.Release(); }
    });
   }
  }
  void Reply(NetworkStream stream, int code, string reason, string mime, byte[] body, bool head) {
   string header = "HTTP/1.1 " + code + " " + reason + "\r\nContent-Type: " + mime +
    "\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n";
   byte[] bytes = Encoding.ASCII.GetBytes(header);
   stream.Write(bytes, 0, bytes.Length);
   if (!head) stream.Write(body, 0, body.Length);
  }
  void Error(NetworkStream stream, int code, string reason, bool head) {
   Reply(stream, code, reason, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(reason), head);
  }
  void Serve(TcpClient client) {
   using (client) {
    client.ReceiveTimeout = 3000;
    client.SendTimeout = 15000;
    using (NetworkStream stream = client.GetStream()) {
     byte[] request = new byte[16384];
     int length = 0;
     while (length < request.Length) {
      int b = stream.ReadByte();
      if (b < 0) return;
      request[length++] = (byte)b;
      if (length >= 4 && request[length-4] == 13 && request[length-3] == 10 && request[length-2] == 13 && request[length-1] == 10) break;
     }
     if (length == request.Length) { Error(stream, 431, "Headers Too Large", false); return; }
     string[] lines = Encoding.ASCII.GetString(request, 0, length).Split(new string[]{"\r\n"}, StringSplitOptions.None);
     Match match = Regex.Match(lines[0], "^([A-Z]+) ([^ ]+) HTTP/1\\.[01]$");
     if (!match.Success) { Error(stream, 400, "Bad Request", false); return; }
     string method = match.Groups[1].Value;
     bool head = method == "HEAD";
     if (method != "GET" && !head) { Error(stream, 405, "Method Not Allowed", false); return; }
     string host = null;
     foreach (string line in lines) if (line.StartsWith("Host:", StringComparison.OrdinalIgnoreCase)) {
      if (host != null) { Error(stream, 400, "Bad Request", head); return; }
      host = line.Substring(5).Trim();
     }
     if (host != "127.0.0.1:" + port && host != "localhost:" + port) { Error(stream, 403, "Forbidden Host", head); return; }
     string target;
     try { target = Uri.UnescapeDataString(match.Groups[2].Value.Split('?')[0]); }
     catch (UriFormatException) { Error(stream, 400, "Bad Request", head); return; }
     if (!target.StartsWith("/") || target.IndexOfAny(new char[]{'\\', ':', '\0', '"', '<', '>', '|'}) >= 0) {
      Error(stream, 403, "Forbidden", head); return;
     }
     foreach (string part in target.Split('/')) if (part == ".." || part == ".") {
      Error(stream, 403, "Forbidden", head); return;
     }
     if (target == "/__tiangong_preview__/health") { Reply(stream, 200, "OK", "application/json; charset=utf-8", health, head); return; }
     if (target == "/") target = "/index.html";
     string file;
     try { file = Path.GetFullPath(Path.Combine(root, target.TrimStart('/'))); }
     catch (ArgumentException) { Error(stream, 400, "Bad Request", head); return; }
     StringComparison comparison = Path.DirectorySeparatorChar == '\\' ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
     if (!file.StartsWith(root, comparison)) { Error(stream, 403, "Forbidden", head); return; }
     if (!File.Exists(file)) { Error(stream, 404, "Not Found", head); return; }
     string mime;
     switch (Path.GetExtension(file).ToLowerInvariant()) {
      case ".html": mime = "text/html; charset=utf-8"; break;
      case ".js": case ".mjs": mime = "text/javascript; charset=utf-8"; break;
      case ".css": mime = "text/css; charset=utf-8"; break;
      case ".json": mime = "application/json; charset=utf-8"; break;
      case ".wasm": mime = "application/wasm"; break;
      case ".png": mime = "image/png"; break;
      case ".jpg": case ".jpeg": mime = "image/jpeg"; break;
      case ".svg": mime = "image/svg+xml"; break;
      case ".ico": mime = "image/x-icon"; break;
      default: mime = "application/octet-stream"; break;
     }
     Reply(stream, 200, "OK", mime, File.ReadAllBytes(file), head);
    }
   }
  }
  public void Dispose() { running = false; listener.Stop(); }
 }
}
'@
    $url = 'http://127.0.0.1:' + $Port + '/'
    $health = @{ stage = 'P03'; commit = $build.commit; candidate = $build.candidate; loopbackOnly = $true } | ConvertTo-Json -Compress
    $server = [Tiangong.LocalPreviewServer]::new($webRoot, $Port, $health)
    try {
        Write-Host ('Tiangong P03 local preview: ' + $url)
        Write-Host 'Keep this window open. Close it to stop the preview.'
        if (-not $NoOpen -and $env:OS -eq 'Windows_NT') {
            $edgePaths = @()
            foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe')) {
                if (Test-Path -LiteralPath $key) { $edgePaths += (Get-Item -LiteralPath $key).GetValue('') }
            }
            foreach ($directory in @([Environment]::GetEnvironmentVariable('ProgramFiles(x86)'), $env:ProgramFiles, $env:LOCALAPPDATA)) {
                if ($directory) { $edgePaths += Join-Path $directory 'Microsoft\Edge\Application\msedge.exe' }
            }
            $edge = $edgePaths | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
            if ($edge) {
                try { Start-Process -FilePath $edge -ArgumentList $url }
                catch { Write-Host ('Open this address in Edge: ' + $url) }
            } else { Write-Host ('Open this address in Edge: ' + $url) }
        }
        $server.Run()
    } finally { $server.Dispose() }
} catch {
    Write-Host ('Preview could not start: ' + $_.Exception.Message)
    Write-Host 'If port 4173 is in use, close the previous preview window and retry.'
    exit 1
}
