import { describe, expect, it } from 'vitest';
import { parsePlan, type Document } from '../src/domain/model';
import { SAMPLE } from '../src/domain/sample';
import { schedule } from '../src/domain/schedule';
import { appendEvent, begin, readySteps, replay, rollbackReview } from '../src/domain/run';
import { decodeDocument, encodeDocument, markdown } from '../src/domain/document';
const sample = () => structuredClone(SAMPLE);
const active = () => begin(sample().plan,'Release lead',1000);
const change = (document: Document, type: Parameters<typeof appendEvent>[1], id?: string, note='Evidence checked') => appendEvent(document,type,note,id,2000+(document.run?.events.length ?? 0));

describe('plan contract',()=>{
  it('accepts the complete sample',()=>expect(parsePlan(SAMPLE.plan).steps).toHaveLength(8));
  it.each(['title','owner','instructions','verification','rollback'])('rejects blank step %s',field=>{
    const p=sample().plan; (p.steps[0] as unknown as Record<string,unknown>)[field]=' ';expect(()=>parsePlan(p)).toThrow();
  });
  it.each([0,-1,1.5,Infinity,1441])('rejects invalid duration %s',minutes=>{const p=sample().plan;p.steps[0].minutes=minutes;expect(()=>parsePlan(p)).toThrow();});
  it('rejects duplicate IDs',()=>{const p=sample().plan;p.steps[1].id=p.steps[0].id;expect(()=>parsePlan(p)).toThrow('unique');});
  it('rejects missing prerequisites',()=>{const p=sample().plan;p.steps[0].dependsOn=['missing'];expect(()=>parsePlan(p)).toThrow('missing dependency');});
  it('rejects cycles and self-dependencies',()=>{
    const p=sample().plan;p.steps[0].dependsOn=['handoff'];expect(()=>parsePlan(p)).toThrow('cycle');
    p.steps[0].dependsOn=['preflight'];expect(()=>parsePlan(p)).toThrow('itself');
  });
  it('rejects unknown fields and excessive plans',()=>{expect(()=>parsePlan({...SAMPLE.plan,extra:true})).toThrow();expect(()=>parsePlan({...SAMPLE.plan,steps:Array(81).fill(SAMPLE.plan.steps[0])})).toThrow();});
});
describe('dependency schedule',()=>{
  it('calculates the critical branch and float across a join',()=>{
    const s=schedule(SAMPLE.plan);expect(s.duration).toBe(43);expect(s.timings['go-no-go'].start).toBe(20);
    expect(s.timings.backup.slack).toBe(3);expect(s.timings.canary.critical).toBe(true);expect(s.margin).toBe(17);
  });
  it('is independent of input ordering',()=>{const p=sample().plan;p.steps.reverse();expect(schedule(p).duration).toBe(43);});
  it('warns about simultaneous work assigned to the same owner',()=>{const p=sample().plan;p.steps[1].owner=p.steps[2].owner;expect(schedule(p).ownerOverlaps).toHaveLength(1);});
  it('reports an overrun without truncating the graph',()=>{const p=sample().plan;p.windowMinutes=10;expect(schedule(p).margin).toBe(-33);});
});
describe('rehearsal transitions',()=>{
  it('blocks downstream start and direct completion',()=>{expect(()=>change(active(),'start','backup')).toThrow('prerequisites');expect(()=>change(active(),'complete','preflight')).toThrow('Start');});
  it('unlocks independent branches only after the prerequisite succeeds',()=>{
    let d=change(active(),'start','preflight');d=change(d,'complete','preflight');expect(readySteps(d.plan,replay(d.plan,d.run!)).map(s=>s.id)).toEqual(['backup','canary']);
  });
  it('requires evidence and pauses progression on failure',()=>{
    const d=change(active(),'start','preflight');expect(()=>change(d,'complete','preflight','')).toThrow();
    const failed=change(d,'fail','preflight');expect(replay(failed.plan,failed.run!).phase).toBe('paused');expect(()=>change(failed,'start','backup')).toThrow('Resume');
  });
  it('records the resume decision while retaining failed attempts',()=>{
    let d=change(change(active(),'start','preflight'),'fail','preflight');d=change(d,'resume');expect(replay(d.plan,d.run!).states.preflight).toBe('pending');d=change(d,'start','preflight');d=change(d,'complete','preflight');expect(d.run!.events.some(e=>e.type==='fail')).toBe(true);
  });
  it('does not permit resume of an active run',()=>expect(()=>change(active(),'resume')).toThrow());
  it('finishes only when all steps succeed and then rejects new events',()=>{
    let d=active();for(const step of schedule(d.plan).ordered){d=change(d,'start',step.id);d=change(d,'complete',step.id);}
    expect(replay(d.plan,d.run!).phase).toBe('completed');expect(()=>change(d,'pause')).toThrow('finished');
  });
  it('aborts with a decision and includes touched tasks in rollback review',()=>{
    let d=change(active(),'start','preflight');d=change(d,'complete','preflight');d=change(d,'start','canary');d=change(d,'abort');
    expect(rollbackReview(d.plan,d.run!).map(s=>s.id)).toEqual(['canary','preflight']);expect(()=>change(d,'start','backup')).toThrow('finished');
  });
  it('rejects edited event histories with repeated IDs or backwards times',()=>{
    const d=change(active(),'start','preflight');const run=d.run!;run.events[1].id=run.events[0].id;expect(()=>replay(d.plan,run)).toThrow('unique');run.events[1].id='unique';run.events[1].at=1;expect(()=>replay(d.plan,run)).toThrow('chronological');
  });
});
describe('portable documents',()=>{
  it('round-trips without losing the evidence history',()=>{const d=change(change(active(),'start','preflight'),'complete','preflight');expect(decodeDocument(encodeDocument(d))).toEqual(d);});
  it('rejects unknown versions, malformed JSON and oversized input',()=>{expect(()=>decodeDocument('{')).toThrow();expect(()=>decodeDocument(JSON.stringify({...SAMPLE,schemaVersion:2}))).toThrow('version');expect(()=>decodeDocument(' '.repeat(2*1024*1024+1))).toThrow('limit');});
  it('validates imported event transitions instead of trusting saved state',()=>{const d=active();d.run!.events.push({id:'wrong',at:2000,type:'complete',stepId:'preflight',note:'Fake result'});expect(()=>decodeDocument(JSON.stringify(d))).toThrow('Start');});
  it('escapes markdown syntax and preserves evidence in reports',()=>{const d=sample();d.plan.title='<script> [title]';expect(markdown(d)).toContain('\\<script\\> \\[title\\]');expect(markdown(change(change(active(),'start','preflight'),'complete','preflight'))).toContain('Evidence checked');});
});
