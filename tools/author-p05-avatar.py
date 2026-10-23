#!/usr/bin/env python3
"""Author the original, articulated P05 traveler as a self-contained glTF 2 GLB."""
import json, math, struct
from pathlib import Path

root=Path(__file__).resolve().parents[1]
doc={'asset':{'version':'2.0','generator':'Tiangong original P05 authoring script'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'traveler-rig','children':[]}],'meshes':[],'materials':[],'buffers':[{}],'bufferViews':[],'accessors':[],'animations':[]}
binary=bytearray()
def accessor(values,kind,component=5126):
 width={'SCALAR':1,'VEC3':3,'VEC4':4}[kind]
 while len(binary)%4:binary.append(0)
 offset=len(binary);fmt='f' if component==5126 else 'H'
 binary.extend(struct.pack('<'+fmt*len(values),*values))
 view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(binary)-offset})
 item={'bufferView':view,'componentType':component,'count':len(values)//width,'type':kind}
 if kind in ('SCALAR','VEC3'):
  item['min']=[min(values[i::width]) for i in range(width)];item['max']=[max(values[i::width]) for i in range(width)]
 doc['accessors'].append(item);return len(doc['accessors'])-1

def material(name,color):
 doc['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':color+[1],'metallicFactor':0,'roughnessFactor':.85}})
 return len(doc['materials'])-1
white=material('ivory-robes',[.82,.86,.76]);jade=material('jade-trim',[.075,.29,.23]);hair=material('ink-hair',[.025,.033,.03]);skin=material('warm-face',[.69,.50,.34]);shoe=material('cloth-shoes',[.055,.075,.07]);gold=material('hairpin',[.57,.42,.18])

def node(name,parent=0,translation=None):
 index=len(doc['nodes']);doc['nodes'].append({'name':name,'children':[]})
 doc['nodes'][parent].setdefault('children',[]).append(index)
 if translation:doc['nodes'][index]['translation']=translation
 return index

def mesh(name,parent,size,centre,mat,round_shape=False):
 positions=[];normals=[];indices=[]
 if round_shape:
  # A low-polygon ellipsoid, using separate vertices at the seam.
  rows=10;cols=16
  for j in range(rows+1):
   phi=math.pi*j/rows
   for i in range(cols+1):
    theta=2*math.pi*i/cols;n=[math.sin(phi)*math.cos(theta),math.cos(phi),math.sin(phi)*math.sin(theta)]
    positions.extend(n[k]*size[k]/2 for k in range(3))
    normal=[n[k]/(size[k]/2) for k in range(3)];length=math.sqrt(sum(v*v for v in normal));normals.extend(v/length for v in normal)
    if j<rows and i<cols:
     a=j*(cols+1)+i;indices.extend([a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1])
 else:
  for normal,u,v in [([1,0,0],[0,1,0],[0,0,1]),([-1,0,0],[0,0,1],[0,1,0]),([0,1,0],[0,0,1],[1,0,0]),([0,-1,0],[1,0,0],[0,0,1]),([0,0,1],[1,0,0],[0,1,0]),([0,0,-1],[0,1,0],[1,0,0])]:
   a=len(positions)//3
   for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]:
    positions.extend((normal[k]+u[k]*s+v[k]*t)*size[k]/2 for k in range(3));normals.extend(normal)
   indices.extend([a,a+1,a+3,a+1,a+2,a+3])
 primitive={'attributes':{'POSITION':accessor(positions,'VEC3'),'NORMAL':accessor(normals,'VEC3')},'indices':accessor(indices,'SCALAR',5123),'material':mat}
 mesh_id=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':[primitive]})
 n=node(name,parent,centre);doc['nodes'][n]['mesh']=mesh_id
 return n

hips=node('hips',0,[0,.86,0]);torso=node('torso',hips,[0,.22,0]);head=node('head',torso,[0,.41,0])
mesh('tunic',torso,[.39,.43,.23],[0,0,0],white)
mesh('jade-belt',hips,[.43,.075,.27],[0,.055,0],jade)
mesh('belt-knot',hips,[.07,.11,.035],[0,.02,-.15],gold)
mesh('left-cross-collar',torso,[.06,.33,.02],[-.07,.095,-.129],jade)
mesh('right-cross-collar',torso,[.06,.33,.02],[.07,.095,-.132],jade)
mesh('neck',torso,[.115,.12,.12],[0,.24,0],skin,True)
mesh('face',head,[.23,.29,.21],[0,0,0],skin,True)
mesh('hair-cap',head,[.244,.2,.23],[0,.07,.018],hair,True)
mesh('hair-bun',head,[.11,.11,.11],[0,.205,.015],hair,True)
mesh('hairpin',head,[.22,.025,.03],[0,.206,.015],gold)
for side in [-1,1]:
 mesh(f'eye-{side}',head,[.018,.018,.012],[side*.042,.025,-.104],hair,True)
arm_ids=[];leg_ids=[];elbows=[];knees=[]
for side,label in [(-1,'left'),(1,'right')]:
 shoulder=node(label+'-shoulder',torso,[side*.245,.15,0]);arm_ids.append(shoulder)
 mesh(label+'-upper-sleeve',shoulder,[.22,.27,.25],[side*.015,-.13,0],white)
 elbow=node(label+'-elbow',shoulder,[0,-.26,0]);elbows.append(elbow)
 mesh(label+'-lower-sleeve',elbow,[.26,.25,.28],[0,-.105,0],white)
 mesh(label+'-cuff',elbow,[.265,.045,.285],[0,-.21,0],jade)
 mesh(label+'-hand',elbow,[.1,.14,.1],[0,-.28,0],skin,True)
 hip=node(label+'-hip',hips,[side*.105,0,0]);leg_ids.append(hip)
 mesh(label+'-robe-panel',hip,[.195,.72,.29],[0,-.355,.015],white)
 mesh(label+'-trouser',hip,[.12,.36,.14],[0,-.18,0],jade)
 knee=node(label+'-knee',hip,[0,-.38,0]);knees.append(knee)
 mesh(label+'-shin',knee,[.115,.37,.13],[0,-.19,0],white)
 mesh(label+'-shoe',knee,[.15,.1,.27],[0,-.43,-.05],shoe)

animated=[torso,head]+arm_ids+elbows+leg_ids+knees
frames=25;times=[i/24 for i in range(frames)];time_id=accessor(times,'SCALAR')
def quat(x=0,y=0,z=0):
 # XYZ rotations, sufficient for the deliberately simple joint poses.
 sx,cx=math.sin(x/2),math.cos(x/2);sy,cy=math.sin(y/2),math.cos(y/2);sz,cz=math.sin(z/2),math.cos(z/2)
 return [sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz]
for clip in ['idle','walk','fly','fall']:
 animation={'name':clip,'samplers':[],'channels':[]}
 for joint in animated:
  values=[]
  for t in times:
   wave=math.sin(t*2*math.pi);x=y=z=0
   if joint==torso:x={'idle':.015*wave,'walk':.025*wave,'fly':-.12+.025*wave,'fall':.08}[clip]
   if joint in arm_ids:
    side=-1 if joint==arm_ids[0] else 1
    x={'idle':.025*wave,'walk':side*.33*wave,'fly':-.25,'fall':-.35}[clip]
    z={'idle':side*.06,'walk':side*.09,'fly':side*.9+.025*wave,'fall':side*1.2}[clip]
   if joint in elbows:x={'idle':-.08,'walk':-.12,'fly':-.35,'fall':-.6}[clip]
   if joint in leg_ids:
    side=-1 if joint==leg_ids[0] else 1;x={'idle':0,'walk':-side*.35*wave,'fly':.18,'fall':side*.12}[clip]
   if joint in knees:
    side=-1 if joint==knees[0] else 1;x={'idle':0,'walk':max(0,side*wave)*.4,'fly':.2,'fall':.17}[clip]
   values.extend(quat(x,y,z))
  sampler=len(animation['samplers']);animation['samplers'].append({'input':time_id,'output':accessor(values,'VEC4'),'interpolation':'LINEAR'});animation['channels'].append({'sampler':sampler,'target':{'node':joint,'path':'rotation'}})
 doc['animations'].append(animation)
for n in doc['nodes']:
 if not n.get('children'):n.pop('children',None)
for m in doc['meshes']:
 for primitive in m['primitives']:
  for a in primitive['attributes'].values():doc['bufferViews'][doc['accessors'][a]['bufferView']]['target']=34962
  doc['bufferViews'][doc['accessors'][primitive['indices']]['bufferView']]['target']=34963
doc['buffers'][0]['byteLength']=len(binary)
while len(binary)%4:binary.append(0)
text=json.dumps(doc,separators=(',',':')).encode()
while len(text)%4:text+=b' '
content=struct.pack('<III',0x46546c67,2,12+8+len(text)+8+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args()
out=args.output or root/'public/characters/p05/traveler.glb';out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(content)
print(json.dumps({'file':str(out),'bytes':len(content),'clips':[a['name'] for a in doc['animations']],'heightMeters':1.75,'rootMotion':False}))
