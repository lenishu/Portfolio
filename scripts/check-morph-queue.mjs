import assert from 'node:assert/strict';
import { createMorphQueue } from '../morph-queue.js';
const q = createMorphQueue({duration:.9,hold:.14});
assert.equal(q.request('hero'),'hero');
assert.equal(q.request('rag'),'rag');
assert.equal(q.request('hpc'),null);
assert.equal(q.advance(.5),null);
assert.equal(q.request('ipa'),null);
assert.equal(q.advance(.4),null,'A completed shape should be held briefly');
assert.equal(q.advance(.15),'ipa','Only the latest destination should run next');
q.request('neuro');q.request('ipa');
assert.equal(q.state.pending,null,'Returning to the current shape cancels stale work');
assert.equal(q.advance(2),null);
const burst = createMorphQueue({duration:.9,hold:.14});
const completed=[];
burst.request('hero');
for(let i=0;i<80;i++){
 const started=burst.request('step-'+i);if(started)completed.push(started);
 const next=burst.advance(.05);if(next)completed.push(next);
}
assert.ok(completed.length>=3,'Shapes must keep completing during continuous scrolling');
assert.ok(completed.length<=5,'A new scroll event must not interrupt an unfinished shape');
let final;
for(let i=0;i<22;i++){const next=burst.advance(.05);if(next)final=next;}
assert.equal(final,'step-79','Stopping must settle on the latest visible section');
assert.equal(burst.state.pending,null);
console.log('PASS: uninterrupted morphs, brief holds, latest destination, reversal, and sustained fast scrolling.');
