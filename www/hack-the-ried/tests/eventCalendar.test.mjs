import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {}, Date, Intl, Set, Map };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/eventCalendar.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, context);
const { eventDay, eventOnDay, filterCalendarEvents, eventsInMonth } = context.exports;
const now = Date.parse('2026-10-07T12:00:00+02:00');
const options = { municipality:'all', category:'all', search:'', horizon:'upcoming', now };
const event=(id,start='2026-10-09T18:00:00+02:00',end='2026-10-09T22:00:00+02:00',extra={})=>({id,title:'Kerwe',municipality:'Bürstadt',category:'festival',start_time:start,end_time:end,...extra});

test('all means all four Ried municipalities, independent of statistics selection',()=>{
 const events=['Bürstadt','Lampertheim','Biblis','Groß-Rohrheim','Lorsch'].map((municipality,i)=>event(String(i),undefined,undefined,{municipality}));
 assert.equal(filterCalendarEvents(events,options).length,4);
 assert.equal(filterCalendarEvents(events,{...options,municipality:'Biblis'}).length,1);
});
test('past is determined by actual end, including ongoing multiday events',()=>{
 const events=[event('past','2026-10-06T10:00+02:00','2026-10-06T22:00+02:00'),event('ongoing','2026-10-06T10:00+02:00','2026-10-08T22:00+02:00',{status:'past'})];
 assert.equal(filterCalendarEvents(events,options)[0].id,'ongoing');
 assert.equal(filterCalendarEvents(events,{...options,horizon:'archive'})[0].id,'past');
});
test('Berlin day is consistent for UTC dates across midnight and winter time',()=>{
 assert.equal(eventDay('2026-10-07T22:30:00Z'),'2026-10-08');
 assert.equal(eventDay('2026-10-27T23:30:00Z'),'2026-10-28');
 assert.ok(eventOnDay(event('a','2026-10-07T22:30:00Z','2026-10-08T00:00:00Z'),'2026-10-08'));
});
test('weekend includes overlap from Thursday but excludes next Monday and expired Friday',()=>{
 const events=[event('long','2026-10-08T12:00+02:00','2026-10-11T18:00+02:00'),event('monday','2026-10-12T12:00+02:00','2026-10-12T13:00+02:00'),event('fri','2026-10-09T10:00+02:00','2026-10-09T12:00+02:00')];
 assert.equal(filterCalendarEvents(events,{...options,horizon:'weekend'}).length,2);
 assert.equal(filterCalendarEvents(events,{...options,horizon:'weekend',now:Date.parse('2026-10-10T12:00+02:00')}).length,1);
});
test('this month ends on its last calendar day, not 35 days ahead',()=>{
 assert.equal(filterCalendarEvents([event('oct','2026-10-31T23:00+01:00','2026-11-01T01:00+01:00'),event('nov','2026-11-01T10:00+01:00','2026-11-01T11:00+01:00')],{...options,horizon:'month'}).length,1);
});
test('long events mark every visible day without a 14 day truncation',()=>{
 const events=[event('long','2026-09-01T00:00+02:00','2026-11-30T23:59+01:00')];
 assert.equal(eventsInMonth(events,2026,9).size,31);
 assert.equal(eventsInMonth(events,2026,10).size,30);
});
test('calendar retains other matching days after a selected-day list filter',()=>{
 const matches=filterCalendarEvents([event('a'),event('b','2026-10-10T12:00+02:00','2026-10-10T15:00+02:00')],options);
 assert.equal(eventsInMonth(matches,2026,9).size,2);
 assert.equal(matches.filter(e=>eventOnDay(e,'2026-10-09')).length,1);
});
test('category and search affect both calendar markers and list, invalid dates excluded',()=>{
 const matches=filterCalendarEvents([event('festival'),event('sport',undefined,undefined,{category:'sports',title:'Volkslauf'}),event('invalid','invalid','invalid')],{...options,search:'volks',category:'sports'});
 assert.equal(matches.length,1);
 assert.equal(eventsInMonth(matches,2026,9).get('2026-10-09')[0].id,'sport');
});
test('cancelled occurrences remain explicitly available instead of silently disappearing',()=>{
 assert.equal(filterCalendarEvents([event('a',undefined,undefined,{status:'cancelled'})],options)[0].status,'cancelled');
});

test('day boundaries are not advertised as actual opening times',()=>{
 assert.equal(context.exports.eventTimeText(event('a','2026-10-09T00:00+02:00','2026-10-09T23:59:59+02:00')),'Ganztägig / Uhrzeit siehe Quelle');
 assert.equal(context.exports.eventTimeText(event('a','2026-10-09T18:00+02:00','2026-10-09T23:59:59+02:00')),'18:00 Uhr');
});
test('overnight event end shows the actual following date',()=>{
 assert.match(context.exports.eventTimeText(event('a','2026-10-09T18:00+02:00','2026-10-10T02:00+02:00')),/10\.10\.2026, 02:00 Uhr/);
});
