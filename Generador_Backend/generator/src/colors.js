const COLORS = ["#2b7a78", "#b3492f", "#8a6d1a", "#4a5568", "#6c8ebf", "#7a4f9e"];

// Mismo usuario → siempre el mismo color (presencia y chat).
function colorForUser(userId) {
  let hash = 0;
  for (const ch of String(userId)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

module.exports = { colorForUser };
