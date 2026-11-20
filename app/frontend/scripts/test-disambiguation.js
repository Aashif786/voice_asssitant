const assert = require("assert");

const candidates = [
  { id: "1", name: "Rahul Sharma", number: "+919876543210", type: "Mobile" },
  { id: "2", name: "Rahul Verma", number: "+919123456789", type: "Work" },
  { id: "3", name: "Rahul Kapoor", number: "+919988776655", type: "Home" },
];

function resolveDisambiguationChoice(text, candidates) {
  const clean = text.trim().toLowerCase();

  // 1. Ordinals
  const ordinals = {
    "1": 0, "1st": 0, "first": 0, "one": 0, "the 1st": 0, "the first": 0, "first one": 0, "the first one": 0,
    "2": 1, "2nd": 1, "second": 1, "two": 1, "the 2nd": 1, "the second": 1, "second one": 1, "the second one": 1,
    "3": 2, "3rd": 2, "third": 2, "three": 2, "the 3rd": 2, "the third": 2, "third one": 2, "the third one": 2,
    "4": 3, "4th": 3, "fourth": 3, "four": 3, "the 4th": 3, "the fourth": 3, "fourth one": 3, "the fourth one": 3,
    "5": 4, "5th": 4, "fifth": 4, "five": 4, "the 5th": 4, "the fifth": 4, "fifth one": 4, "the fifth one": 4,
  };

  if (ordinals[clean] !== undefined && candidates[ordinals[clean]]) {
    return candidates[ordinals[clean]];
  }

  for (const [key, idx] of Object.entries(ordinals)) {
    const regex = new RegExp(`\\b${key}\\b`, "i");
    if (regex.test(clean) && candidates[idx]) {
      return candidates[idx];
    }
  }

  const numMatch = clean.match(/(?:option|number|choice|item)?\s*#?([1-9])\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (candidates[idx]) {
      return candidates[idx];
    }
  }

  // 2a. Exact full name match first
  for (const c of candidates) {
    const cName = c.name.toLowerCase();
    if (clean === cName || clean === `call ${cName}` || clean === `message ${cName}`) {
      return c;
    }
  }

  // 2b. Score candidates by match quality
  let bestCandidate = null;
  let maxScore = 0;
  for (const c of candidates) {
    const cName = c.name.toLowerCase();
    let score = 0;
    if (clean.includes(cName)) score += 10;
    const parts = cName.split(/\s+/).filter((p) => p.length >= 3);
    for (const part of parts) {
      if (clean.includes(part)) {
        score += 2;
      }
    }
    if (c.type && clean.includes(c.type.toLowerCase())) {
      score += 5;
    }
    if (score > maxScore) {
      maxScore = score;
      bestCandidate = c;
    }
  }

  if (bestCandidate && maxScore >= 2) {
    return bestCandidate;
  }

  return null;
}

console.log("--- Running Disambiguation Tests ---");

// Test 1: Ordinals
assert.strictEqual(resolveDisambiguationChoice("1st", candidates).name, "Rahul Sharma");
assert.strictEqual(resolveDisambiguationChoice("the first one", candidates).name, "Rahul Sharma");
assert.strictEqual(resolveDisambiguationChoice("second", candidates).name, "Rahul Verma");
assert.strictEqual(resolveDisambiguationChoice("2nd", candidates).name, "Rahul Verma");
assert.strictEqual(resolveDisambiguationChoice("3", candidates).name, "Rahul Kapoor");

// Test 2: Name directly
assert.strictEqual(resolveDisambiguationChoice("Rahul Verma", candidates).name, "Rahul Verma");
assert.strictEqual(resolveDisambiguationChoice("Verma", candidates).name, "Rahul Verma");
assert.strictEqual(resolveDisambiguationChoice("Kapoor", candidates).name, "Rahul Kapoor");

// Test 3: Type matching
assert.strictEqual(resolveDisambiguationChoice("the mobile one", candidates).name, "Rahul Sharma");
assert.strictEqual(resolveDisambiguationChoice("work", candidates).name, "Rahul Verma");

console.log("All 10 disambiguation tests passed successfully!");
