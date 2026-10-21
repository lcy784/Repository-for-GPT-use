import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { inside, readJson } from './lib.mjs';

export function inspectImplementationInputs(root) {
  const decisions = readJson(path.join(root, 'quality/implementation-decisions.json'));
  const profile = readJson(path.join(root, 'quality/acceptance-profile.json'));
  const contracts = readJson(path.join(root, 'quality/contracts.json'));
  for (const name of ['tiangong-user-requirements-v1.0.md', 'tiangong-product-requirements-v1.0.md', 'tiangong-system-architecture-v1.0.md', 'tiangong-phased-development-plan-v1.0.md']) {
    assert(existsSync(path.join(root, 'docs/天宫HTML', name)), `Required source is missing: ${name}`);
  }
  assert.deepEqual(decisions.architecture.map(item => item.id), ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06']);
  const decisionStates = ['engineering-adopted', 'user-selected', 'pending-user-preference', 'deferred'];
  assert(decisions.architecture.every(item => decisionStates.includes(item.status) && item.decision?.length > 10));
  assert(decisions.firstRelease.proposal.length > 0 && typeof decisions.firstRelease.fullProductScopeUnchanged === 'boolean');
  assert(Array.isArray(decisions.unresolved) && decisions.unresolved.every(item => item.id && item.blocks && item.description));
  assert.equal(profile.cloud.renderBackend, 'WebGL2');
  for (const value of [profile.cloud.viewport.width, profile.cloud.viewport.height, profile.cloud.deviceScaleFactor, profile.cloud.simulationHz, profile.cloud.maxCatchUpSteps, profile.cloud.stageTimeoutMs, ...Object.values(profile.provisionalSimulationParameters).filter(value => typeof value === 'number')]) {
    assert(Number.isFinite(value) && value > 0, 'Test parameters must be finite positive numbers');
  }
  for (const field of ['walkingMetersPerSecond', 'flyingMetersPerSecond', 'gravityMetersPerSecondSquared', 'positionToleranceMeters']) {
    assert(Number.isFinite(profile.provisionalSimulationParameters[field]), `Missing numeric parameter: ${field}`);
  }
  assert.equal(profile.targetWindows.targetFps, 60);
  assert.equal(profile.targetWindows.mayUseCloudResultsInstead, false);
  assert(profile.visualReview.referenceFiles.length > 0 && profile.visualReview.views.length >= 3 && profile.visualReview.preserve.length >= 3);
  for (const reference of profile.visualReview.referenceFiles) assert(existsSync(inside(root, reference)), 'Missing visual reference');
  for (const view of profile.visualReview.views) {
    assert(view.id && Number.isFinite(view.fovDegrees) && view.fovDegrees > 0 && view.fovDegrees < 180);
    for (const vector of [view.eyeMeters, view.targetMeters]) assert(Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite), 'Camera positions must be numeric');
  }
  assert.equal(profile.visualReview.allTenReferencesRemainProductReferences, true);
  assert.equal(profile.visualReview.automaticImageDifferenceProvesArtisticAcceptance, false);
  assert.equal(contracts.lengthUnit, 'meter');
  assert.equal(contracts.upAxis, '+Y');
  assert.equal(contracts.handedness, 'right-handed');
  assert.equal(contracts.stateWriter, 'LocalSession.commitSimulationResult');
  for (const name of ['PlayerIntent', 'PlayerState', 'WorldManifest']) assert(Array.isArray(contracts.interfaces[name]) && contracts.interfaces[name].length >= 5);
  const blockers = decisions.unresolved.filter(item => item.blocks === 'P00').map(item => item.description);
  if (decisions.architecture.some(item => item.status === 'pending-user-preference')) blockers.push('An architecture decision is still awaiting a user preference.');
  if (decisions.firstRelease.status !== 'user-selected') blockers.push('First-release scope has not been selected by the user.');
  return { decisions, profile, contracts, blockers };
}
