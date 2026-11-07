import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = process.env.SONGLIST_SNAPSHOT_URL ?? 'https://sl.ngoro.dedyn.io/t/kosmos_lada/catalog-snapshot.json';
let data;
if (process.env.SONGLIST_SNAPSHOT_STDIN === '1') {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  data = JSON.parse(input);
} else {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
  if (response.ok) {
    data = await response.json();
  } else if (response.status === 404) {
    // Пока отдельный экспорт не выложен, используем публичные данные витрины.
    // Они сериализованы SvelteKit через devalue; ниже всё равно оставляем лишь
    // белый список полей, который уже виден любому зрителю.
    const pageDataUrl = new URL('__data.json', endpoint);
    const pageResponse = await fetch(pageDataUrl, { signal: AbortSignal.timeout(20_000) });
    if (!pageResponse.ok) throw new Error(`Новый сонглист ответил HTTP ${pageResponse.status}; прежний снимок сохранён`);
    const raw = await pageResponse.json();
    const { unflatten } = await import(process.env.SONGLIST_DEVALUE_MODULE ?? 'devalue');
    const pageNode = raw.nodes?.find((node) => node?.type === 'data');
    if (!pageNode) throw new Error('Неожиданный формат витрины; прежний снимок сохранён');
    const page = unflatten(pageNode.data);
    data = { snapshotAt: new Date().toISOString(), songs: page.songs };
  } else {
    throw new Error(`Новый сонглист ответил HTTP ${response.status}; прежний снимок сохранён`);
  }
}
if (!data || !Array.isArray(data.songs) || data.songs.length < 100) {
  throw new Error('Получен неполный каталог; прежний снимок сохранён');
}

const ids = new Set();
const songs = data.songs.map((song) => {
  const id = Number(song.id);
  const title = String(song.title ?? '').trim();
  const artist = String(song.artist ?? '').trim();
  const createdAt = new Date(song.createdAt);
  const tags = Array.isArray(song.tags) ? song.tags.map(String) : [];
  if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id) || !title || title.length > 500 || artist.length > 300 || isNaN(createdAt)) {
    throw new Error('В каталоге найдена некорректная песня; прежний снимок сохранён');
  }
  if (tags.some((tag) => !tag || tag.length > 100)) throw new Error('Некорректный тег; прежний снимок сохранён');
  ids.add(id);
  // Белый список полей: внутренние комментарии, текст песни и служебные метки
  // никогда не попадут в публичный статический архив.
  return { id, title, artist, createdAt: createdAt.toISOString(), tags };
});

try {
  const previous = JSON.parse(await readFile(join(root, 'catalog-snapshot.json'), 'utf8'));
  if (Array.isArray(previous.songs) && songs.length < previous.songs.length * 0.8) {
    throw new Error('Каталог неожиданно уменьшился более чем на 20%; прежний снимок сохранён');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const snapshotAt = new Date(data.snapshotAt);
if (isNaN(snapshotAt)) throw new Error('Некорректная дата снимка; прежний снимок сохранён');
const snapshot = { snapshotAt: snapshotAt.toISOString(), songs };
const csvValue = (value) => `"${String(value).replaceAll('"', '""')}"`;
const csv = ['id,title,artist,active,attributes', ...songs.map((song) =>
  [song.id, csvValue(song.title), csvValue(song.artist), 'true', csvValue(song.tags.join(', '))].join(',')
)].join('\n') + '\n';

await writeFile(join(root, 'catalog-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
await writeFile(join(root, 'songs.csv'), csv);
console.log(`Обновлён резервный каталог: ${songs.length} песен на ${snapshot.snapshotAt}`);
