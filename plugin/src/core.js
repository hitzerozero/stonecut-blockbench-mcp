const ID = 'stonecut_bridge';
const VERSION = '1.0.0';
const TITLE = 'Stonecut Bridge';
const PathM = require('path');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const DEFAULT_PORT = 38790;
const TOKEN_FILE_NAME = '.stonecut_blockbench_token';
const TOKEN_HEADER = 'x-stonecut-token';
const OUTPUT_FOLDER_NAME = 'stonecut-blockbench';
const DEFAULT_NAMESPACE = 'minecraft';
const MAX_BODY = 16 * 1024 * 1024;
const GECKO_MISSING = 'The GeckoLib Blockbench plugin is not installed, so a Bedrock Entity project was used. ' +
  'Install it in Blockbench: File > Plugins > Available > "GeckoLib Models & Animations".';
const state = { server: null, token: null, queue: Promise.resolve(), deletables: [], fsByRoot: {} };
const endpoints = {};

function bad(msg) { throw new Error(msg); }
function setting(key) { const s = settings[ID + '_' + key]; return s ? s.value : undefined; }
function needProject() { if (!Project) bad('No project open. Call new_project, new_java_item, open_model or open_java_model first.'); }
function isJava() { return !!(Format && Format.id === 'java_block'); }
function isGecko() { return !!(Format && Format.id === 'geckolib_model'); }
function geckoInstalled() { return !!Formats.geckolib_model; }
function findBone(n) { return Group.all.find((g) => g.name === n); }
function findAnim(n) { return Animator.animations.find((a) => a.name === n) || bad('Animation not found: ' + n); }
function animClass() { return typeof BBAnimation !== 'undefined' ? BBAnimation : Animation; }
function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }
function modeId() { return Mode.selected ? Mode.selected.id : 'edit'; }
function lastSegment(p) { return String(p || '').split(/[\\\/]/).pop(); }
function safeFileName(s) { return s.replace(/[^A-Za-z0-9_.\-]/g, '_'); }
