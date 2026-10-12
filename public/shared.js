// Shared between TV and phones
window.CHARACTERS = [
  { id: 'fox',     emoji: '🦊', name: 'Ember',   color: '#ff7a29' },
  { id: 'panda',   emoji: '🐼', name: 'Bamboo',  color: '#c9d4e2' },
  { id: 'frog',    emoji: '🐸', name: 'Hopper',  color: '#4cd964' },
  { id: 'octo',    emoji: '🐙', name: 'Inky',    color: '#ff4f8b' },
  { id: 'unicorn', emoji: '🦄', name: 'Prism',   color: '#b47cff' },
  { id: 'tiger',   emoji: '🐯', name: 'Stripes', color: '#ffb020' },
  { id: 'penguin', emoji: '🐧', name: 'Waddles', color: '#4aa8ff' },
  { id: 'robot',   emoji: '🤖', name: 'Bolt',    color: '#8fa3b8' },
  { id: 'alien',   emoji: '👽', name: 'Zorp',    color: '#2ee6c8' },
  { id: 'dragon',  emoji: '🐲', name: 'Scorch',  color: '#e63946' },
  { id: 'chick',   emoji: '🐥', name: 'Peep',    color: '#ffe14d' },
  { id: 'shark',   emoji: '🦈', name: 'Fin',     color: '#5b6cff' },
];
window.CHAR = Object.fromEntries(window.CHARACTERS.map(c => [c.id, c]));

// Game registry. Each file in /games calls Hub.register({...}).
window.Hub = { games: [], register(g) { this.games.push(g); } };

window.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
