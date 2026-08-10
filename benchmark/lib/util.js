'use strict';

// Shared normalization primitives for the deterministic scorer.
// All text comparison in this benchmark is rule-based token overlap — no LLM callbacks.

const FREQUENCIES = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'];

function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  const n = norm(s);
  return n ? new Set(n.split(' ')) : new Set();
}

// Dice/Sørensen-style token overlap in [0,1] over the union of tokens.
function tokenOverlap(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  const union = new Set([...A, ...B]);
  if (union.size === 0) return 0;
  let inter = 0;
  for (const t of union) if (A.has(t) && B.has(t)) inter++;
  return inter / union.size;
}

// Substring containment on normalized text (one side fully embedded in the other
// is treated as a strong match when the contained side is non-trivial).
function contains(a, b) {
  const A = norm(a);
  const B = norm(b);
  if (!A || !B) return false;
  if (A.includes(B) || B.includes(A)) return true;
  return false;
}

// Text-field fidelity: 1 = both empty, or containment w/ non-trivial side; else token overlap.
function textScore(pred, gold) {
  const p = norm(pred);
  const g = norm(gold);
  if (!p && !g) return 1;      // both null/empty -> correct absence
  if (!p || !g) return 0;      // missing or fabricated
  if (contains(p, g) && Math.max(p.split(' ').length, g.split(' ').length) >= 2) return 1;
  if (contains(g, p) && p.split(' ').length >= 2) return 1;
  return tokenOverlap(p, g);
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function isTextEmpty(v) {
  return v == null || norm(v) === '';
}

function freqDistance(a, b) {
  const i = FREQUENCIES.indexOf(norm(a));
  const j = FREQUENCIES.indexOf(norm(b));
  if (i < 0 || j < 0) return null; // not valid frequencies
  return Math.abs(i - j);
}

module.exports = {
  FREQUENCIES,
  norm,
  tokens,
  tokenOverlap,
  contains,
  textScore,
  clamp01,
  isTextEmpty,
  freqDistance,
};