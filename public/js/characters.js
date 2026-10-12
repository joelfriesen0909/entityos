import { clamp } from './physics.js';

export const CHARACTERS = [
  { id: 'cyber', name: 'Cyber', color: '#c5d8ea', accent: '#00d2ff', shape: 'round', personality: 'Du bist Cyber, ein neugieriger, freundlicher digitaler Begleiter. Du erklärst klar und stellst hilfreiche Rückfragen.', pitch: 1, rhythm: 4 },
  { id: 'nova', name: 'Nova', color: '#dce8f4', accent: '#84baff', shape: 'nova', personality: 'Du bist Nova, ruhig, zukunftsorientiert und neugierig auf Wissenschaft. Du sprichst präzise, warm und ohne übertriebenen Jargon.', pitch: 1.05, rhythm: 4.8 },
  { id: 'milo', name: 'Milo', color: '#e8cbb4', accent: '#e7a879', shape: 'milo', personality: 'Du bist Milo, ein warmherziger, humorvoller Begleiter. Du hörst aufmerksam zu und ermutigst ohne leere Floskeln.', pitch: 1.15, rhythm: 3.5 },
  { id: 'ghost-clean', name: 'Ghost', color: '#e4eaf0', accent: '#b9cde1', shape: 'ghost', personality: 'Du bist Ghost, sanft, nachdenklich und ein wenig geheimnisvoll. Du antwortest ruhig und bildhaft, bleibst aber hilfreich und verständlich.', pitch: 0.85, rhythm: 5.5 },
  { id: 'pixel', name: 'Pixel', color: '#b4cfc1', accent: '#8bc9ad', shape: 'pixel', personality: 'Du bist Pixel, ein verspielter, analytischer Tüftler. Du magst klare Schritte, kreative Ideen und trockenen Humor.', pitch: 1.25, rhythm: 3 },
  { id: 'onyx', name: 'Onyx', color: '#333846', accent: '#b6a9d5', shape: 'onyx', personality: 'Du bist Onyx, gelassen, selbstbewusst und höflich. Du bist direkt, loyal und hast einen subtilen trockenen Humor.', pitch: 0.7, rhythm: 5 },
];
const LEGACY = {
  clown: ['Clown', '#fafafa', '#ff4757', 1.8, 'Verspielt, schelmisch und humorvoll.'],
  robot: ['Mech-Bot', '#95a5a6', '#e74c3c', 0.7, 'Sachlich, analytisch und freundlich.'],
  vampire: ['Vampir', '#b2bec3', '#c0392b', 0.7, 'Charmant, elegant und ein wenig dramatisch.'],
  nature: ['Natur', '#7cb342', '#2ecc71', 1.1, 'Geduldig, naturverbunden und fürsorglich.'],
  alien: ['Alien', '#008000', '#00ff00', 1.6, 'Neugierig auf menschliche Gewohnheiten.'],
  ghost: ['Phantom', '#c8dcff', '#a3cbff', 0.8, 'Leise, verträumt und freundlich.'],
  pirate: ['Pirat', '#e67e22', '#f39c12', 0.8, 'Abenteuerlustig, herzlich und direkt.'],
  ninja: ['Ninja', '#bdc3c7', '#e74c3c', 0.9, 'Besonnen, aufmerksam und präzise.'],
  wizard: ['Magier', '#bdc3c7', '#9b59b6', 0.8, 'Weise, fantasievoll und hilfsbereit.'],
};
export function profileFor(id, custom) {
  if (id === 'custom') return { ...CHARACTERS[1], ...custom, id: 'custom', personality: 'Du bist ein freundlicher, neugieriger Begleiter. Behalte deinen eigenen Namen bei und reagiere aufmerksam.', rhythm: 4 };
  const found = CHARACTERS.find(c => c.id === id);
  if (found) return found;
  const old = LEGACY[id];
  return old ? { id, name: old[0], color: old[1], accent: old[2], pitch: old[3], shape: 'round', rhythm: 4, personality: `Du bist ${old[0]}. ${old[4]}` } : CHARACTERS[0];
}
export const CUSTOM_KEY = 'entityos.custom.v1';
export const DEFAULT_CUSTOM = { name: 'Mein Charakter', color: '#dce8f4', accent: '#84baff', shape: 'nova', size: 1, image: '', imageScale: 1, imageX: 0, imageY: 0 };
export function validateCustom(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Ungültige Charakterdaten.');
  const number = (key, low, high) => clamp(Number.isFinite(Number(raw[key])) ? Number(raw[key]) : DEFAULT_CUSTOM[key], low, high);
  const hex = value => /^#[\da-f]{6}$/i.test(value);
  const image = raw.image || '';
  if (typeof image !== 'string' || image.length > 700000 || (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))) throw new Error('Ungültiges oder zu großes Charakterbild.');
  return {
    name: String(raw.name || DEFAULT_CUSTOM.name).trim().slice(0, 40) || DEFAULT_CUSTOM.name,
    color: hex(raw.color) ? raw.color : DEFAULT_CUSTOM.color,
    accent: hex(raw.accent) ? raw.accent : DEFAULT_CUSTOM.accent,
    shape: ['nova', 'milo', 'ghost', 'pixel', 'onyx'].includes(raw.shape) ? raw.shape : 'nova',
    size: number('size', 0.65, 1.1), image,
    imageScale: number('imageScale', 0.5, 1.2), imageX: number('imageX', -25, 25), imageY: number('imageY', -25, 25),
  };
}
export function readCustom(storage) {
  const saved = storage.getItem(CUSTOM_KEY);
  return saved ? validateCustom(JSON.parse(saved)) : null;
}
export function saveCustom(storage, config) {
  const valid = validateCustom(config);
  storage.setItem(CUSTOM_KEY, JSON.stringify(valid));
  return valid;
}
export async function prepareImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Bitte PNG, JPG oder WebP wählen.');
  if (file.size > 3 * 1024 * 1024) throw new Error('Das Bild darf maximal 3 MB groß sein.');
  // Decode and re-encode; no SVG, scripts, remote URLs or executable metadata are stored.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (img.naturalWidth * img.naturalHeight > 16_000_000) throw new Error('Bitte ein Bild mit höchstens 16 Megapixeln verwenden.');
    const ratio = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/webp', 0.9);
    if (result.length > 700000) throw new Error('Das optimierte Bild ist zu groß. Bitte ein einfacheres Bild wählen.');
    return result;
  } catch (error) {
    if (error instanceof DOMException) throw new Error('Dieses Bild konnte nicht gelesen werden.');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}

export function avatarMarkup(profile) {
  // Geometry and colours come from validated presets/config, names are assigned via textContent.
  const { color, accent, shape } = profile;
  const dark = shape === 'onyx';
  const rounding = shape === 'pixel' ? 13 : shape === 'nova' || shape === 'onyx' ? 30 : 48;
  const eyes = dark ? '#ece7fb' : '#283442';
  return `<svg viewBox="0 0 120 120" aria-hidden="true" class="avatar-svg">
    <ellipse cx="60" cy="110" rx="30" ry="4" fill="black" opacity=".15"/>
    <path d="M19 69L7 78M101 69L113 78" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <rect x="2" y="74" width="12" height="15" rx="${shape === 'pixel' ? 3 : 6}" fill="${color}"/><rect x="106" y="74" width="12" height="15" rx="6" fill="${color}"/>
    <rect x="18" y="10" width="84" height="94" rx="${rounding}" fill="${color}" stroke="${accent}" stroke-width="1.5"/>
    <path d="M35 24 Q60 15 84 26" fill="none" stroke="white" opacity=".3" stroke-width="2"/>
    ${shape === 'nova' ? `<path d="M32 39h56" stroke="${accent}" stroke-width="3"/>` : ''}
    ${shape === 'pixel' ? `<path d="M28 25h8v8h-8M83 80h8v8h-8" fill="${accent}"/>` : ''}
    ${shape === 'milo' ? '<ellipse cx="33" cy="73" rx="7" ry="3" fill="#d59881"/><ellipse cx="87" cy="73" rx="7" ry="3" fill="#d59881"/>' : ''}
    <ellipse cx="43" cy="57" rx="6" ry="${shape === 'ghost' ? 10 : 8}" fill="${eyes}"/><ellipse cx="77" cy="57" rx="6" ry="8" fill="${eyes}"/>
    <path d="M49 80q11 8 22 0" stroke="${eyes}" stroke-width="3" stroke-linecap="round" fill="none"/>
  </svg>`;
}

export function paintProfile(node, profile) {
  node.dataset.design = profile.shape;
  node.style.setProperty('--character-color', profile.color);
  node.style.setProperty('--character-accent', profile.accent);
  node.style.setProperty('--idle-duration', `${profile.rhythm || 4}s`);
  node.style.setProperty('--character-size', profile.size || 1);
  let img = node.querySelector('.character-image');
  if (!img) { img = document.createElement('img'); img.className = 'character-image'; img.alt = ''; node.querySelector('.face-idle-wrap').append(img); }
  img.hidden = !profile.image;
  if (profile.image) {
    img.src = profile.image;
    img.style.transform = `translate(${profile.imageX || 0}px, ${profile.imageY || 0}px) scale(${profile.imageScale || 1})`;
  } else img.removeAttribute('src');
  node.classList.toggle('has-sprite', Boolean(profile.image));
}
