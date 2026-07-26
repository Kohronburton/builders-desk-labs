import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflowSuite, severityFor, summarizeRuns } from '../engine.js';

test('baseline suite covers workflow and security checks',()=>{const run=runWorkflowSuite({workflowId:'support-intake',tenantId:'tenant-acme',fault:'none'},1,new Date('2026-07-26T12:00:00Z'));assert.equal(run.tests.length,10);assert.equal(run.status,'passed');assert.equal(run.score,100);assert.equal(run.findings.length,0)});
test('tenant bypass produces a critical isolation finding',()=>{const run=runWorkflowSuite({workflowId:'support-intake',tenantId:'tenant-acme',fault:'tenant-scope-bypass'},2);const finding=run.findings.find((item)=>item.title.includes('Cross-tenant'));assert.equal(finding.severity,'critical');assert.equal(run.status,'failed')});
test('duplicate event exposes idempotency regression',()=>{const run=runWorkflowSuite({workflowId:'resident-maintenance',tenantId:'tenant-harbor',fault:'duplicate-event'},3);assert.equal(run.tests.find((item)=>item.id==='idempotency').status,'failed');assert.equal(run.tests.find((item)=>item.id==='sla_timer').status,'warning')});
test('security failures are always critical',()=>{assert.equal(severityFor('permission_scope','failed'),'critical');assert.equal(severityFor('tenant_isolation','failed'),'critical')});
test('run summary counts critical and open findings',()=>{const clean=runWorkflowSuite({workflowId:'support-intake',tenantId:'tenant-acme',fault:'none'},1);const failed=runWorkflowSuite({workflowId:'support-intake',tenantId:'tenant-acme',fault:'tenant-scope-bypass'},2);const summary=summarizeRuns([failed,clean]);assert.equal(summary.totalRuns,2);assert.equal(summary.criticalFindings,1);assert.ok(summary.openFindings>=1)});
