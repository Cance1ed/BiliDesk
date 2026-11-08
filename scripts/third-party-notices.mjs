import fs from 'node:fs/promises';
import path from 'node:path';
const lock = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
const sections = [
  'BiliDesk — third-party notices\n\nDependencies retain their own licenses. This file includes notices for installed production dependencies. Platform-specific Koffi binaries use the Koffi MIT license. Electron and Chromium notices also ship as LICENSE.electron.txt and LICENSES.chromium.html alongside the application executable.\n',
];
for (const [directory, metadata] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!directory || metadata.dev) continue;
  let files;
  try {
    files = await fs.readdir(directory);
  } catch {
    continue;
  } // Optional binaries for other OS/CPU targets.
  const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  sections.push(
    `\n${'='.repeat(72)}\n${pkg.name}@${pkg.version}\nLicense: ${metadata.license || pkg.license}\n`,
  );
  const notices = files.filter((name) => /^(licen[cs]e|copying|notice)([.\-_]|$)/i.test(name));
  if (!notices.length && pkg.name.startsWith('@koromix/koffi-')) {
    sections.push(await fs.readFile('node_modules/koffi/LICENSE.txt', 'utf8'));
  } else {
    if (!notices.length) throw new Error(`Missing license notice: ${pkg.name}`);
    for (const name of notices)
      sections.push(`\n--- ${name} ---\n${await fs.readFile(path.join(directory, name), 'utf8')}`);
  }
}
await fs.writeFile('THIRD_PARTY_NOTICES.txt', sections.join('\n'));
console.log('Generated THIRD_PARTY_NOTICES.txt');
