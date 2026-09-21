import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectSpots, distanceKm } from '../public/model.js';
const {spots} = JSON.parse(readFileSync(new URL('../public/data/spots.json', import.meta.url)));
test('search tolerates macrons, whitespace and casing',()=>assert.equal(selectSpots(spots,{query:'  WANAKA  '})[0].id,'roys-bay'));
test('filters intersect and saved-only respects category',()=>assert.deepEqual(selectSpots(spots,{type:'sea',savedOnly:true,saved:['mission-bay','roys-bay']}).map(s=>s.id),['mission-bay']));
test('nearest sort uses geographic distance without mutating source',()=>{const first=spots[0]; assert.equal(selectSpots(spots,{location:[-36.848,174.831]})[0].id,'mission-bay');assert.equal(spots[0],first);assert.equal(distanceKm([0,0],[0,0]),0);assert.ok(Math.abs(distanceKm([0,0],[0,1])-111.195)<0.01)});
test('seed records have unique ids, valid NZ coordinates and honest missing conditions',()=>{assert.equal(new Set(spots.map(s=>s.id)).size,spots.length); for(const s of spots){assert.ok(s.coordinates[0]<-34&&s.coordinates[0]>-48);assert.ok(s.coordinates[1]>165&&s.coordinates[1]<179);assert.ok(new URL(s.source.url).protocol==='https:');for(const c of Object.values(s.conditions)){assert.equal(c.status,'unavailable');assert.equal(c.value,null);assert.equal(c.observedAt,null)}}});
