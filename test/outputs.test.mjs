// What StoryReel leaves in a folder the caller names goes there one way (files.mjs · writeOutput): made under a new
// name, then renamed onto its own. A rename replaces a link already at that name and never follows it, so a link
// another user planted in a shared folder (/tmp: macOS has no protected_symlinks) never makes StoryReel write the file
// it points at. Here: the helper, each place a film, a release, a breakdown, a tool still, a paced voice and the
// segment store write, and a guard that no write in src/ goes around it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, symlinkSync, existsSync, chmodSync, statSync, renameSync, copyFileSync, realpathSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tempDir} from './tmp.mjs';
import {writeOutput, outputFolder, refuseFolders, securePath, makeFolder, placeVoice, copyVoice, parseMounts, mountOf, privateGroup, filesOnly} from '../src/files.mjs';
import {homedir, tmpdir} from 'node:os';
import {evenTimings, applyPacing, compileFilm, renderFilm, makeFilm} from '../src/index.mjs';
import {makeRelease} from '../src/release.mjs';
import {breakdown} from '../src/breakdown.mjs';
import {loadProject, still} from '../src/tools.mjs';
import {folderStore} from '../src/segments.mjs';
import {fitVoice} from '../src/music.mjs';
import {makeScratch} from '../src/scratch.mjs';

const has = cmd => !spawnSync(cmd, ['-version']).error;
const posix = process.platform !== 'win32';

/** Links planted at `names` in `dir`, each to a file of ours elsewhere (or to `missing` names: dangling); returns what to check after. */
function plant(t, dir, names, {missing = []} = {}) {
  const victims = tempDir('victims', t), planted = [];
  for (const name of [...names, ...missing]) {
    const victim = path.join(victims, name.replace(/[\\/]/g, '_')), dangling = missing.includes(name);
    if (!dangling) writeFileSync(victim, `ours: ${name}`);
    mkdirSync(path.dirname(path.join(dir, name)), {recursive: true});
    symlinkSync(victim, path.join(dir, name));
    planted.push({name, at: path.join(dir, name), victim, dangling});
  }
  return planted;
}
/** Each planted link was replaced by a file of StoryReel's, and the file it pointed at is as it was (or still absent). */
function replaced(planted) {
  for (const {name, at, victim, dangling} of planted) {
    const st = lstatSync(at);
    assert.ok(!st.isSymbolicLink() && st.isFile(), `${name}: the link is replaced by a file`);
    if (dangling) assert.ok(!existsSync(victim), `${name}: nothing was made where the dangling link pointed`);
    else assert.equal(readFileSync(victim, 'utf8'), `ours: ${name}`, `${name}: the file the link pointed at is untouched`);
  }
}
/** What is left beside the outputs under writeOutput's temporary names (nothing, after a write). */
const parts = dir => readdirSync(dir).filter(n => n.startsWith('.storyreel-') && n.endsWith('.part'));

test('writeOutput: bytes, a move and a copy (linked or not) each replace a link at the name, never write through it', t => {
  const dir = tempDir('out', t), work = tempDir('work', t);
  const planted = plant(t, dir, ['a.txt', 'b.bin', 'c.mp4', 'd.mp4', 'e.jpg']);
  writeOutput(path.join(dir, 'a.txt'), 'text\n');
  writeOutput(path.join(dir, 'b.bin'), Buffer.from([1, 2, 3]));
  writeFileSync(path.join(work, 'video.mp4'), 'video'); writeOutput(path.join(dir, 'c.mp4'), {move: path.join(work, 'video.mp4')});
  writeFileSync(path.join(work, 'kept.mp4'), 'kept'); writeOutput(path.join(dir, 'd.mp4'), {copy: path.join(work, 'kept.mp4'), link: true});
  writeOutput(path.join(dir, 'e.jpg'), {copy: path.join(work, 'kept.mp4')});
  replaced(planted);
  assert.deepEqual(['a.txt', 'c.mp4', 'd.mp4', 'e.jpg'].map(f => readFileSync(path.join(dir, f), 'utf8')), ['text\n', 'video', 'kept', 'kept']);
  assert.deepEqual([...readFileSync(path.join(dir, 'b.bin'))], [1, 2, 3]);
  assert.ok(!existsSync(path.join(work, 'video.mp4')), 'a move takes the file');
  assert.ok(existsSync(path.join(work, 'kept.mp4')), 'a copy leaves it');
  if (posix) assert.equal(statSync(path.join(dir, 'd.mp4')).ino, statSync(path.join(work, 'kept.mp4')).ino, 'linked: one copy on disk');
  assert.deepEqual(parts(dir), [], 'nothing left under a temporary name');
});

test('writeOutput: a folder at an output\'s name is refused, naming the fix, and kept with all it holds', t => {
  const dir = tempDir('out', t), work = tempDir('work', t), folder = path.join(dir, 'chapters.txt');
  mkdirSync(folder); writeFileSync(path.join(folder, 'theirs'), 'x'); writeFileSync(path.join(work, 'v.mp4'), 'v');
  const why = new RegExp(`${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is a folder: StoryReel writes a file there, and never removes a folder to make room — move or rename the folder, or give another out`);
  assert.throws(() => writeOutput(folder, 'text'), why);
  assert.throws(() => writeOutput(folder, {move: path.join(work, 'v.mp4')}), why);
  assert.throws(() => writeOutput(folder, {copy: path.join(work, 'v.mp4'), link: true}), why);
  assert.deepEqual(readdirSync(folder), ['theirs']);
  assert.ok(existsSync(path.join(work, 'v.mp4')), 'and what was to be moved stays');
  assert.deepEqual(parts(dir), []);
  assert.throws(() => writeOutput(path.join(dir, 'x'), 42), /writeOutput: give the bytes \(a Buffer or a string\), \{move: file\} or \{copy: file, link\?\}/);
});

test('writeOutput: a move across disks (EXDEV) is copied beside the output under a new name, created exclusively, then renamed; a failure leaves nothing beside it', t => {
  const dir = tempDir('out', t), work = tempDir('work', t), from = path.join(work, 'film-out.mp4'), final = path.join(dir, 'film.mp4');
  const planted = plant(t, dir, ['film.mp4']);
  writeFileSync(from, 'the video');
  const steps = [];
  const fs = {
    renameSync: (a, b) => { steps.push(['rename', path.basename(path.dirname(a)) === path.basename(work) ? 'work' : 'beside', b === final]); if (a === from) { const e = new Error('cross-device link not permitted'); e.code = 'EXDEV'; throw e; } renameSync(a, b); },
    copyFileSync: (a, b, mode) => { steps.push(['copy', path.dirname(b) === dir, mode]); copyFileSync(a, b, mode); },
  };
  writeOutput(final, {move: from}, fs);
  assert.deepEqual(steps, [['rename', 'work', true], ['copy', true, 1], ['rename', 'beside', true]], 'tried as a rename; across disks, copied beside it exclusively (COPYFILE_EXCL), then renamed');
  replaced(planted);
  assert.equal(readFileSync(final, 'utf8'), 'the video');
  assert.ok(!existsSync(from), 'the work folder\'s file is removed after the copy');
  assert.deepEqual(parts(dir), []);
  // Any other error is the caller's to see, and the temporary file goes.
  writeFileSync(from, 'again');
  const denied = {renameSync: (a, b) => { const e = new Error(a === from ? 'cross-device link not permitted' : 'permission denied'); e.code = a === from ? 'EXDEV' : 'EACCES'; throw e; }};
  assert.throws(() => writeOutput(final, {move: from}, denied), /permission denied/);
  assert.deepEqual(parts(dir), [], 'nothing left beside the output');
  assert.equal(readFileSync(final, 'utf8'), 'the video', 'the output as it was');
  assert.throws(() => writeOutput(final, {move: path.join(work, 'gone.mp4')}), /ENOENT/, 'a move of nothing is not quietly a copy');
});

test('outputFolder: makes the folders StoryReel names inside the caller\'s (never writable by others), keeps a real one of ours, refuses a link or a file there', t => {
  const out = tempDir('out', t), elsewhere = tempDir('elsewhere', t);
  const was = process.umask(0o002);   // a umask that leaves folders group-writable: what StoryReel makes is 0755 all the same
  t.after(() => process.umask(was));
  assert.equal(outputFolder(path.join(out, 'new'), ['work', 'youtube']), path.join(realpathSync(out), 'new', 'work', 'youtube'), 'the real path');
  if (posix) assert.deepEqual(['work', path.join('work', 'youtube')].map(f => statSync(path.join(out, 'new', f)).mode & 0o7777), [0o755, 0o755]);
  writeFileSync(path.join(out, 'new', 'work', 'youtube', 'kept'), 'k');
  outputFolder(path.join(out, 'new'), ['work', 'youtube']);
  assert.deepEqual(readdirSync(path.join(out, 'new', 'work', 'youtube')), ['kept'], 'a real folder of ours is kept as it is');
  symlinkSync(elsewhere, path.join(out, 'stills'), 'dir'); writeFileSync(path.join(out, 'shots'), 'a file');
  assert.throws(() => outputFolder(out, 'stills'), /stills is a link: StoryReel writes only into a folder of its own there, that no one else can change — remove it, or give another out/);
  assert.throws(() => outputFolder(out, 'shots'), /shots is a file: StoryReel writes only into a folder of its own there/);
  assert.deepEqual(readdirSync(elsewhere), [], 'nothing written where the link points');
});

test('outputFolder: an existing folder another user owns, or one of ours that others can change (0777), is refused; a sticky 1777 one of ours is not', {skip: posix ? false : 'no POSIX owners or modes'}, t => {
  const out = tempDir('shared', t);
  // Another user made <out>/work (as in a shared /tmp): lstat says whose — played here by a stubbed lstat.
  mkdirSync(path.join(out, 'work'));
  const theirs = at => { const st = lstatSync(at); return at === path.join(realpathSync(out), 'work') ? {isDirectory: () => true, isSymbolicLink: () => false, uid: process.getuid() + 1, mode: st.mode} : st; };
  assert.throws(() => outputFolder(out, ['work', 'youtube'], {lstat: theirs}), /work belongs to another user: StoryReel writes only into a folder of its own there, that no one else can change — remove it, or give another out/);
  assert.ok(!existsSync(path.join(out, 'work', 'youtube')), 'nothing made inside it');
  chmodSync(path.join(out, 'work'), 0o777);
  assert.throws(() => outputFolder(out, ['work', 'youtube']), /work can be changed by other users \(mode 0777, no sticky bit\): StoryReel writes only into a folder of its own there/);
  chmodSync(path.join(out, 'work'), 0o1777);
  assert.equal(outputFolder(out, ['work', 'youtube']), path.join(realpathSync(out), 'work', 'youtube'), 'sticky: others may add an entry, never replace one of ours');
});

// The one rule (files.mjs · securePath): every folder on the real path, up to the root, a real folder owned by this user
// or root and writable by no one else unless sticky. `chain` plays a system's folders by path for a stubbed lstat.
const REFUSED = 'StoryReel writes only below folders no other user can change \\(each yours or root\'s, writable by no one else unless sticky\\) — render into a folder of your own and copy the film out';
const stat = (mode, uid = process.getuid?.() ?? 0, gid = -1) => ({mode: 0o040000 | mode, uid, gid, isDirectory: () => true, isSymbolicLink: () => false});
function chain(folders) {
  const has = p => p in folders;
  return {lstat: p => { if (!has(p)) throw Object.assign(new Error(`ENOENT ${p}`), {code: 'ENOENT'}); return folders[p]; }, realpath: p => p, exists: has};
}

test('securePath: every folder on the real path is checked up to the root — a 0777 grandparent, a sticky folder another user owns, a group-writable one, another user\'s — and the first that fails is named', {skip: posix ? false : 'no POSIX owners or modes'}, t => {
  const me = process.getuid(), refused = (at, why) => new RegExp(`^Error: ${escape(at)} ${why}: ${REFUSED}$`);
  const system = {'/': stat(0o755, 0), '/srv': stat(0o755, 0)};
  // A 0777 non-sticky grandparent: the reviewer renamed `team` and planted a link; refused, naming the grandparent.
  assert.throws(() => securePath('/srv/open/team/out', chain({...system, '/srv/open': stat(0o777, me), '/srv/open/team': stat(0o755, me), '/srv/open/team/out': stat(0o755, me)})),
    refused('/srv/open', 'can be changed by other users \\(mode 0777, no sticky bit\\)'));
  // A sticky folder owned by another user: its owner may rename any entry in it.
  assert.throws(() => securePath('/srv/shared/out', chain({...system, '/srv/shared': stat(0o1777, 4242), '/srv/shared/out': stat(0o755, me)})), refused('/srv/shared', 'belongs to another user'));
  assert.throws(() => securePath('/srv/team/out', chain({...system, '/srv/team': stat(0o775, me), '/srv/team/out': stat(0o755, me)})), /^Error: \/srv\/team can be changed by its group \(mode 0775, no sticky bit; not provably a group of yours alone\): .* — chmod g-w it, or render into a folder of your own and copy the film out$/);
  assert.throws(() => securePath('/srv/theirs/out', chain({...system, '/srv/theirs': stat(0o755, 4242)})), refused('/srv/theirs', 'belongs to another user'), 'the nearest folder that exists, for an out still to be made');
  // Sticky and owned by this user, or by root: accepted.
  assert.equal(securePath('/srv/ours/out', chain({...system, '/srv/ours': stat(0o1777, me), '/srv/ours/out': stat(0o755, me)})), '/srv/ours/out');
  assert.equal(securePath('/tmp/film/out', chain({'/': stat(0o755, 0), '/tmp': stat(0o1777, 0), '/tmp/film': stat(0o700, me)})), '/tmp/film/out', 'like Linux\'s /tmp, root\'s and sticky; out still to be made');
  // A typical Linux home: /home root's, /home/<me> mine.
  assert.equal(securePath('/home/me/films/out', chain({'/': stat(0o755, 0), '/home': stat(0o755, 0), '/home/me': stat(0o750, me), '/home/me/films': stat(0o755, me)})), '/home/me/films/out');
  // This system's own: the home folder (/Users/<me> on macOS, /home/<me> on Linux) and the temp folder (macOS: /var/folders/…/T).
  assert.equal(securePath(homedir()), realpathSync(homedir()));
  assert.equal(securePath(tmpdir()), realpathSync(tmpdir()));
  // Real folders: a group-writable one, and a private one under it.
  const top = tempDir('secure', t), open = path.join(top, 'open'), team = path.join(open, 'team');
  mkdirSync(team, {recursive: true}); chmodSync(open, 0o777);
  assert.throws(() => securePath(path.join(team, 'out')), refused(realpathSync(open), 'can be changed by other users \\(mode 0777, no sticky bit\\)'));
  chmodSync(open, 0o1777);
  assert.equal(securePath(path.join(team, 'out')), path.join(realpathSync(team), 'out'), 'sticky and mine');
});

test('securePath: the real path is returned and written through, so a link in the given path swapped mid-run changes nothing', {skip: posix ? false : 'no POSIX modes'}, t => {
  // <0777>/link → a private folder elsewhere: the real path is safe, and the store writes only through it.
  const open = tempDir('open', t), mine = tempDir('mine', t), victim = tempDir('victim', t), link = path.join(open, 'link');
  chmodSync(open, 0o777); symlinkSync(mine, link, 'dir');
  assert.throws(() => securePath(open), /can be changed by other users/, 'the 0777 folder itself is refused');
  assert.equal(securePath(path.join(link, 'store')), path.join(realpathSync(mine), 'store'), 'through the link: judged, and returned, as where it leads');
  const store = folderStore(path.join(link, 'store')), key = 'e'.repeat(24), work = tempDir('work', t);
  assert.equal(store.dir, path.join(realpathSync(mine), 'store'));
  // Another user swaps the link for one to the victim's folder, mid-run.
  rmSync(link); symlinkSync(victim, link, 'dir');
  writeFileSync(path.join(work, 'seg.mp4'), 'frames');
  store.put(key, path.join(work, 'seg.mp4'), {version: 1});
  assert.deepEqual(readdirSync(victim), [], 'nothing reached the victim through the swapped link');
  assert.deepEqual(readdirSync(path.join(mine, 'store')).sort(), [`${key}.json`, `${key}.mp4`], 'the segment went where the path was checked');
  // A link whose target lies inside the 0777 folder is refused: that folder is on the real path.
  const inside = path.join(open, 'inside'); mkdirSync(inside); chmodSync(inside, 0o755);
  const via = path.join(mine, 'via'); symlinkSync(inside, via, 'dir');
  assert.throws(() => securePath(path.join(via, 'out')), /can be changed by other users \(mode 0777/);
});

test('makeFolder checks again once the folders are made: a link another user plants between the check and the mkdir (mkdir -p follows it) refuses before anything is written', {skip: posix ? false : 'no POSIX owners or modes'}, t => {
  const top = tempDir('sticky', t), theirs = tempDir('theirs', t), mine = tempDir('elsewhere', t);
  chmodSync(top, 0o1777);                                   // sticky and ours: anyone may add an entry
  const planted = at => (p, o) => { symlinkSync(at, path.join(top, 'a'), 'dir'); return mkdirSync(p, o); };   // the race, on cue
  const foreign = at => { const st = lstatSync(at); return at === realpathSync(theirs) ? {...st, mode: st.mode, gid: st.gid, uid: process.getuid() + 1, isDirectory: () => true, isSymbolicLink: () => false} : st; };
  assert.throws(() => makeFolder(path.join(top, 'a', 'b'), {mkdir: planted(theirs), lstat: foreign}), new RegExp(`^Error: ${escape(realpathSync(theirs))} belongs to another user: `));
  assert.deepEqual(readdirSync(path.join(theirs, 'b')), [], 'mkdir followed the link, and nothing was written there');
  rmSync(path.join(top, 'a'));
  // A link to a folder of ours elsewhere passes the walk, and is refused for leading somewhere else.
  assert.throws(() => makeFolder(path.join(top, 'a', 'b'), {mkdir: planted(mine)}), new RegExp(`^Error: ${escape(path.join(realpathSync(top), 'a', 'b'))} changed while StoryReel made it: a folder on the way now leads to ${escape(path.join(realpathSync(mine), 'b'))} — render into a folder of your own`));
  rmSync(path.join(top, 'a'));
  assert.equal(makeFolder(path.join(top, 'a', 'b')), path.join(realpathSync(top), 'a', 'b'), 'no race: made, and its real path returned');
});

const MOUNTS = [
  '/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)',
  '/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse, protect, root data)',
  '/dev/disk4s2 on /Volumes/Ext Drive (apfs, local, nodev, nosuid, journaled, noowners)',
  '/dev/disk5s1 on /Volumes/Backup (apfs, local, nodev, nosuid, journaled)',
  'map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)',
].join('\n');

test('a macOS drive mounted with "Ignore ownership" (noowners) is refused: every folder on it looks like the viewer\'s; the parser reads /sbin/mount\'s lines, spaces in a name included', {skip: posix ? false : 'no POSIX owners or modes'}, () => {
  assert.deepEqual(parseMounts(MOUNTS).map(m => m.point), ['/', '/System/Volumes/Data', '/Volumes/Ext Drive', '/Volumes/Backup', '/System/Volumes/Data/home']);
  assert.deepEqual(parseMounts(MOUNTS)[2].flags, ['apfs', 'local', 'nodev', 'nosuid', 'journaled', 'noowners']);
  assert.equal(mountOf('/Volumes/Ext Drive/films', parseMounts(MOUNTS)).point, '/Volumes/Ext Drive');
  assert.equal(mountOf('/Volumes/Ext Drive2/films', parseMounts(MOUNTS)).point, '/', 'a name that only begins like a mount point is not on it');
  const me = process.getuid(), mine = stat(0o755, me), root = stat(0o755, 0);
  const drive = {'/': root, '/Volumes': root, '/Volumes/Ext Drive': mine, '/Volumes/Ext Drive/films': mine, '/Volumes/Backup': mine, '/Volumes/Backup/films': mine};
  assert.throws(() => securePath('/Volumes/Ext Drive/films/out', {...chain(drive), mounts: MOUNTS, platform: 'darwin'}),
    /^Error: \/Volumes\/Ext Drive\/films is on \/Volumes\/Ext Drive, a drive that ignores ownership \(noowners\): every folder on it looks like yours — render on the internal disk and copy the film out$/);
  assert.equal(securePath('/Volumes/Backup/films/out', {...chain(drive), mounts: MOUNTS, platform: 'darwin'}), '/Volumes/Backup/films/out', 'a drive that keeps owners');
  // A table that cannot be read: refused under /Volumes/ (external drives), never on the internal disk.
  assert.throws(() => securePath('/Volumes/Backup/films/out', {...chain(drive), mounts: null, platform: 'darwin'}),
    /^Error: \/Volumes\/Backup\/films is on a drive whose mount table cannot be read \(\/sbin\/mount\), so whether it ignores ownership cannot be told — render on the internal disk and copy the film out$/);
  const home = {'/': root, '/Users': root, '/Users/me': mine, '/Users/me/films': mine};
  assert.equal(securePath('/Users/me/films/out', {...chain(home), mounts: null, platform: 'darwin'}), '/Users/me/films/out', 'the internal disk: never refused for an unreadable table');
  // A path typed in another case on a disk that ignores case: judged (and returned) as the disk spells it.
  const typed = {...chain(drive), realpath: p => p.replace('/volumes/ext drive', '/Volumes/Ext Drive'), exists: p => chain(drive).exists(p.replace('/volumes/ext drive', '/Volumes/Ext Drive')), mounts: MOUNTS, platform: 'darwin'};
  assert.throws(() => securePath('/volumes/ext drive/films/out', typed), /is on \/Volumes\/Ext Drive, a drive that ignores ownership/);
  // A device whose name holds " on ": the point begins at the last " on /".
  assert.deepEqual(parseMounts('//guest@nas/Films on tour on /Volumes/Films on tour (smbfs, nodev, nosuid, mounted by guest)'), [{point: '/Volumes/Films on tour', flags: ['smbfs', 'nodev', 'nosuid', 'mounted by guest']}]);
  // exFAT and FAT have no owners: every folder on them shows 0777, already refused by the walk.
  assert.throws(() => securePath('/Volumes/Stick/out', {...chain({'/': root, '/Volumes': root, '/Volumes/Stick': stat(0o777, me)}), mounts: '/dev/disk6s1 on /Volumes/Stick (exfat, local, nodev, nosuid, noowners)', platform: 'darwin'}), /\/Volumes\/Stick can be changed by other users \(mode 0777/);
});

test('the real path is the disk\'s own spelling: a folder typed in another case on a disk that ignores case comes back as the disk spells it', t => {
  const top = tempDir('case', t); mkdirSync(path.join(top, 'Mixed', 'Inner'), {recursive: true});
  const typed = path.join(top, 'mixed', 'inner');
  if (!existsSync(typed)) return t.skip('this disk tells case apart');
  assert.equal(securePath(typed), path.join(realpathSync(top), 'Mixed', 'Inner'));
});

/** /etc/group, /etc/passwd and /etc/nsswitch.conf as a Linux system would hold them, for this user (`me`, primary group `gid`) and another, bob (uid me + 1). */
const FILES = 'passwd:         files\ngroup:          files  # local accounts only\nshadow:         files\nhosts:          files dns\n';
const accounts = (me, gid) => {
  const linux = (group, passwd, nsswitch = FILES) => ({group, passwd, nsswitch, platform: 'linux'});
  const mine = `me:x:${me}:${gid}::/home/me:/bin/bash\n`, bob = `bob:x:${me + 1}:${gid + 1}::/home/bob:/bin/bash\n`;
  return {
    private: linux(`root:x:0:\nme:x:${gid}:\nstaff:x:${gid + 1}:bob,me\n`, `root:x:0:0::/root:/bin/sh\n${mine}${bob}`),
    listed: linux(`me:x:${gid}:bob\n`, `${mine}${bob}`),
    primary: linux(`me:x:${gid}:\n`, `${mine}bob:x:${me + 1}:${gid}::/home/bob:/bin/bash\n`),
    sss: linux(`me:x:${gid}:\n`, mine, 'passwd: files sss\ngroup: files sss\n'),
    ldap: linux(`me:x:${gid}:\n`, mine, 'passwd: files ldap\ngroup: files [NOTFOUND=return] ldap\n'),
    systemd: linux(`me:x:${gid}:\n`, mine, 'passwd: files systemd\ngroup: files systemd\n'),
    compat: linux(`me:x:${gid}:\n`, mine, 'passwd: compat\ngroup: compat\n'),
    compatPlus: linux(`me:x:${gid}:\n+:::\n`, `${mine}+::::::\n`, 'passwd: compat\ngroup: compat\n'),
    noSwitch: linux(`me:x:${gid}:\n`, mine, null),
    mac: {group: `staff:*:${gid}:\n`, passwd: mine, nsswitch: null, platform: 'darwin'},
  };
};

test('the account files decide a private group only when they are the whole story: nsswitch names exactly files (or compat with no + line); never on macOS', {skip: posix ? false : 'no POSIX owners or modes'}, () => {
  const ACCOUNTS = accounts(process.getuid(), process.getgid()), gid = process.getgid();
  assert.equal(filesOnly(ACCOUNTS.private), true, 'passwd and group: files');
  assert.equal(filesOnly(ACCOUNTS.compat), true, 'compat, and no + line');
  for (const name of ['sss', 'ldap', 'systemd', 'compatPlus', 'noSwitch']) assert.equal(filesOnly(ACCOUNTS[name]), false, `${name}: a directory can hold members the files never show`);
  for (const name of ['sss', 'ldap', 'systemd', 'compatPlus', 'noSwitch']) assert.equal(privateGroup(gid, ACCOUNTS[name]), false, name);
  assert.equal(privateGroup(gid, ACCOUNTS.compat), true);
  assert.equal(privateGroup(gid, ACCOUNTS.mac), false, 'macOS: staff, with no member listed, is still every user\'s primary group');
  const root = stat(0o755, 0), project = {'/': root, '/Users': root, '/Users/me': stat(0o755, process.getuid(), gid), '/Users/me/films': stat(0o775, process.getuid(), gid)};
  assert.throws(() => securePath('/Users/me/films/out', {...chain(project), accounts: ACCOUNTS.mac, mounts: '', platform: 'darwin'}), /\/Users\/me\/films can be changed by its group \(mode 0775, no sticky bit; not provably a group of yours alone\): .* — chmod g-w it/);
  assert.throws(() => securePath('/Users/me/films/out', {...chain(project), accounts: ACCOUNTS.ldap, mounts: ''}), /can be changed by its group/);
});

test('a user private group (Linux, umask 002): a 0775 folder whose group is this user\'s alone is not open to others; a shared group, or groups that cannot be read, still refuse, naming chmod g-w', {skip: posix ? false : 'no POSIX owners or modes'}, () => {
  const me = process.getuid(), gid = process.getgid(), root = stat(0o755, 0);
  const ACCOUNTS = accounts(me, gid);
  assert.equal(privateGroup(gid, ACCOUNTS.private), true, 'no members, and no one else\'s primary group');
  assert.equal(privateGroup(gid, ACCOUNTS.listed), false, 'bob is listed in it');
  assert.equal(privateGroup(gid, ACCOUNTS.primary), false, 'bob\'s primary group');
  assert.equal(privateGroup(gid, null), false, 'unreadable: not private');
  const project = {'/': root, '/home': root, '/home/me': stat(0o750, me, gid), '/home/me/films': stat(0o775, me, gid)};
  assert.equal(securePath('/home/me/films/out', {...chain(project), accounts: ACCOUNTS.private, mounts: ''}), '/home/me/films/out');
  const groupWritable = /^Error: \/home\/me\/films can be changed by its group \(mode 0775, no sticky bit; not provably a group of yours alone\): .* — chmod g-w it, or render into a folder of your own and copy the film out$/;
  for (const accounts of [ACCOUNTS.listed, ACCOUNTS.primary, null]) assert.throws(() => securePath('/home/me/films/out', {...chain(project), accounts, mounts: ''}), groupWritable);
  assert.throws(() => securePath('/home/me/films/out', {...chain({...project, '/home/me/films': stat(0o775, me, gid + 1)}), accounts: ACCOUNTS.private, mounts: ''}), groupWritable, 'a group that is not this user\'s own');
  assert.throws(() => securePath('/home/me/films/out', {...chain({...project, '/home/me/films': stat(0o777, me, gid)}), accounts: ACCOUNTS.private, mounts: ''}), /can be changed by other users \(mode 0777/, 'others may write: never private');
});

test('every entry that writes into a folder the caller names refuses a shared, non-sticky one before anything is written', {skip: posix ? false : 'no POSIX modes'}, async t => {
  const open = tempDir('open', t); chmodSync(open, 0o777);
  const refused = /can be changed by other users \(mode 0777, no sticky bit\)/, at = (...p) => path.join(open, ...p);
  const compiled = await compileFilm({...film, render: undefined});
  await assert.rejects(renderFilm({film: compiled, storyboard, timings: film.timings, out: at('film.mp4'), width: 160, height: 90, fps: 5}), refused);
  await assert.rejects(renderFilm({film: compiled, storyboard, timings: film.timings, out: path.join(tempDir('private', t), 'film.mp4'), work: at('work'), width: 160, height: 90, fps: 5}), refused, 'a `work` named in a shared folder');
  await assert.rejects(makeFilm({...film, out: at('made', 'film.mp4')}), refused);
  await assert.rejects(makeRelease({...film, out: at('release'), targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general'}}), refused);
  writeFileSync(at('v.mp4'), 'never read');
  await assert.rejects(breakdown(at('v.mp4'), {out: at('breakdown')}), refused);
  const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url));
  await assert.rejects(still(await loadProject({cwd: project, out: at('tools')}), {at: 'one+2.5'}), refused);
  assert.throws(() => folderStore(at('store')), refused);
  await assert.rejects(applyPacing({runDir: open, board: {scenes: []}, timings: {scenes: []}, pacing: {voiceSpeed: 1, sceneTail: 1, holds: []}}), refused);
  assert.throws(() => fitVoice(open, {scenes: []}, {scenes: []}), refused);
  assert.deepEqual(readdirSync(open), ['v.mp4'], 'nothing written there');
});

test('every folder StoryReel makes asks for 0755 and nothing is chmod-ed after: umask 000 gives 0755, 022 gives 0755, 077 gives 0700; narration/ the same', {skip: posix ? false : 'no POSIX modes'}, async t => {
  const was = process.umask();
  t.after(() => process.umask(was));
  const mode = f => statSync(f).mode & 0o7777;
  for (const [umask, want] of [[0o000, 0o755], [0o022, 0o755], [0o077, 0o700]]) {
    process.umask(umask);
    const top = tempDir('umask', t), at = (...p) => path.join(top, ...p);
    makeFolder(at('a', 'b', 'c'));
    outputFolder(at('out'), ['work', 'youtube']);
    // makeFilm's out folder, made before its first stage (which refuses this storyboard).
    await assert.rejects(makeFilm({...film, storyboard: {title: 'x', scenes: []}, out: at('made', 'deep', 'film.mp4')}), /no scenes/);
    // The voice copy's folders, and narration/ once placed.
    const voice = at('voice'); makeFolder(path.join(voice, 'audio'));
    writeFileSync(path.join(voice, 'timings.json'), JSON.stringify({scenes: [{id: 'a', audio: 'audio/a.wav'}]})); writeFileSync(path.join(voice, 'audio', 'a.wav'), 'A');
    const copy = makeScratch(top, '.narration');
    copyVoice(voice, copy); placeVoice(copy, at('narration'));
    const made = ['a', 'a/b', 'a/b/c', 'out', 'out/work', 'out/work/youtube', 'made', 'made/deep', 'narration', 'narration/audio'];
    assert.deepEqual(Object.fromEntries(made.map(f => [f, mode(at(f)).toString(8)])), Object.fromEntries(made.map(f => [f, want.toString(8)])), `umask ${umask.toString(8).padStart(3, '0')}`);
  }
});

test('refuseFolders: a folder at any of the names refuses before anything is written; the others are fine missing or as files', t => {
  const out = tempDir('names', t);
  mkdirSync(path.join(out, 'chapters.txt')); writeFileSync(path.join(out, 'film.mp4'), 'old');
  refuseFolders([path.join(out, 'film.mp4'), path.join(out, 'poster.jpg')]);
  assert.throws(() => refuseFolders([path.join(out, 'film.mp4'), path.join(out, 'chapters.txt')]), /chapters\.txt is a folder: StoryReel writes a file there, and never removes a folder to make room/);
});

// A release: makeFilm's outputs in <out>/work/<target>/ (the video FFmpeg writes, poster.jpg, chapters.txt, the
// captions, making-of.json) and the post in <out>/<target>/ (the video, captions, thumbnail, post.json, post.txt,
// CREDITS.txt), every name with a link planted at it, in a shared out folder (1777).
const storyboard = {title: 'Links', scenes: [{id: 'a', title: 'The start', narration: 'One pebble, two sheep, three.'}]};
const slide = {name: 'slide', story: {compile: () => ({hang: 1, draw: c => { c.fillStyle = '#2a77a8'; c.fillRect(0, 0, 1600, 900); }})}};
const film = {storyboard, timings: evenTimings(storyboard, {wordSeconds: .3}), recipe: {story: {kit: 'slide'}, poster: ['a', 'two sheep']}, kits: [slide], render: {fps: 5}};

test('a release replaces a link planted at every output\'s name — the film\'s and the post\'s — and never writes the file it points at', {skip: has('ffmpeg') ? false : 'needs ffmpeg'}, async t => {
  const out = tempDir('release', t);
  if (posix) chmodSync(out, 0o1777);   // shared, like /tmp: anyone may add an entry
  const made = ['links.mp4', 'poster.jpg', 'chapters.txt', 'captions.srt', 'captions.vtt', 'making-of.json'].map(f => path.join('work', 'youtube', f));
  const posted = ['links.mp4', 'captions.srt', 'captions.vtt', 'thumbnail.jpg', 'post.json', 'post.txt', 'CREDITS.txt'].map(f => path.join('youtube', f));
  const planted = plant(t, out, [...made, ...posted.slice(1)], {missing: [posted[0]]});
  const [yt] = await makeRelease({...film, out, targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general', thumbnail: 'poster'}});
  replaced(planted);
  assert.equal(yt.video, path.join(realpathSync(out), 'youtube', 'links.mp4'), 'the real path it was written through');
  assert.equal(JSON.parse(readFileSync(path.join(out, 'youtube', 'post.json'), 'utf8')).video, 'links.mp4');
  assert.match(readFileSync(path.join(out, 'work', 'youtube', 'chapters.txt'), 'utf8'), /^0:00 The start\n$/);
  assert.deepEqual([...parts(path.join(out, 'youtube')), ...parts(path.join(out, 'work', 'youtube'))], []);
});

test('a release refuses a link planted where it makes a target\'s folder, before anything is drawn', async t => {
  const out = tempDir('release', t), elsewhere = tempDir('elsewhere', t);
  symlinkSync(elsewhere, path.join(out, 'youtube'), 'dir');
  await assert.rejects(makeRelease({...film, out, targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general'}}), /youtube is a link: StoryReel writes only into a folder of its own there, that no one else can change — remove it, or give another out/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('a folder at any output\'s name refuses before anything is drawn or written: a render, a film, a release, a breakdown', async t => {
  const visible = dir => readdirSync(dir).sort();
  // A render: the folder at chapters.txt is found while the job is prepared, before film.mp4 or poster.jpg exist.
  const dir = tempDir('early', t), compiled = await compileFilm({...film, render: undefined});
  mkdirSync(path.join(dir, 'chapters.txt'));
  await assert.rejects(renderFilm({film: compiled, storyboard, timings: film.timings, out: path.join(dir, 'film.mp4'), width: 160, height: 90, fps: 5}), /chapters\.txt is a folder: StoryReel writes a file there, and never removes a folder to make room — move or rename the folder, or give another out/);
  assert.deepEqual(visible(dir), ['chapters.txt'], 'no video, no poster, no working folder');
  // A film: its record is written last, so it is checked first.
  const made = tempDir('early-film', t); mkdirSync(path.join(made, 'making-of.json'));
  await assert.rejects(makeFilm({...film, out: path.join(made, 'film.mp4'), render: {width: 160, height: 90, fps: 5}}), /making-of\.json is a folder/);
  assert.deepEqual(visible(made), ['making-of.json']);
  // A release: every target's names, before the first target renders.
  const out = tempDir('early-release', t); mkdirSync(path.join(out, 'youtube', 'post.json'), {recursive: true});
  await assert.rejects(makeRelease({...film, out, targets: ['youtube'], post: {title: 'Links', description: 'A test.', audience: 'general'}}), /youtube\/post\.json is a folder/);
  assert.deepEqual(readdirSync(path.join(out, 'work', 'youtube')), [], 'nothing rendered');
  // A breakdown: its files' names, before a frame is read (the video need not even be read).
  const broken = tempDir('early-breakdown', t), video = path.join(broken, 'v.mp4'); writeFileSync(video, 'not read'); mkdirSync(path.join(broken, 'out', 'breakdown.md'), {recursive: true});
  await assert.rejects(breakdown(video, {out: path.join(broken, 'out')}), /breakdown\.md is a folder/);
  assert.deepEqual(visible(path.join(broken, 'out')), ['breakdown.md']);
});

test('a breakdown replaces a link planted at each of its files, and refuses a link at its shots folder', {skip: has('ffmpeg') && has('ffprobe') ? false : 'needs ffmpeg and ffprobe'}, async t => {
  const dir = tempDir('breakdown', t), video = path.join(dir, 'v.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x36:rate=10', '-pix_fmt', 'yuv420p', video], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(dir, 'out');
  const planted = plant(t, out, ['breakdown.json', 'breakdown.md', 'record.json', 'overview.png', path.join('shots', 'shot-01.png')]);
  const {files} = await breakdown(video, {out});
  replaced(planted);
  assert.deepEqual(files.sheets, [path.join(realpathSync(out), 'shots', 'shot-01.png')]);
  const linked = path.join(dir, 'linked'), elsewhere = tempDir('elsewhere', t);
  mkdirSync(linked); symlinkSync(elsewhere, path.join(linked, 'shots'), 'dir');
  await assert.rejects(breakdown(video, {out: linked}), /shots is a link: StoryReel writes only into a folder of its own there/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

test('a tool\'s still replaces a link planted at its name, and refuses a link at the stills folder', async t => {
  const project = fileURLToPath(new URL('./fixtures/tools/', import.meta.url)), out = tempDir('tools', t), p = await loadProject({cwd: project, out});
  const planted = plant(t, out, [path.join('stills', 'one+2.5.png')]);
  assert.equal((await still(p, {at: 'one+2.5'})).file, path.join(realpathSync(out), 'stills', 'one+2.5.png'));
  replaced(planted);
  const linked = tempDir('tools-linked', t), elsewhere = tempDir('elsewhere', t);
  symlinkSync(elsewhere, path.join(linked, 'stills'), 'dir');
  await assert.rejects(still(await loadProject({cwd: project, out: linked}), {at: 'one+2.5'}), /stills is a link: StoryReel writes only into a folder of its own there/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

/** A PCM16 mono WAV: a soft tone of `seconds` at 24 kHz (a stand-in for a voice). */
function toneWav(seconds, rate = 24000) {
  const n = Math.round(seconds * rate), body = Buffer.alloc(n * 2), header = Buffer.alloc(44);
  for (let i = 0; i < n; i++) body.writeInt16LE(Math.round(3000 * Math.sin(2 * Math.PI * 220 * i / rate)), i * 2);
  header.write('RIFF', 0, 'ascii'); header.writeUInt32LE(36 + body.length, 4); header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii'); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii'); header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}

test('pacing a voice in place replaces a link at the scene\'s audio and at the unpaced copy beside it, and never writes where they point', async t => {
  const run = tempDir('voice', t), board = {scenes: [{id: 'a', narration: 'One two three.'}]}, timings = evenTimings(board, {tail: .5});
  timings.scenes[0].audio = 'a.wav';
  const victims = tempDir('victims', t), take = path.join(victims, 'take.wav'), tone = toneWav(timings.scenes[0].duration);
  writeFileSync(take, tone); symlinkSync(take, path.join(run, 'a.wav'));                                 // the scene's audio given through a link
  const nowhere = path.join(victims, 'created.wav'); symlinkSync(nowhere, path.join(run, 'a.unpaced.wav'));   // a dangling link where the unpaced copy goes
  await applyPacing({runDir: run, board, timings, pacing: {voiceSpeed: 1, sceneTail: 1, holds: []}});
  for (const f of ['a.wav', 'a.unpaced.wav']) assert.ok(lstatSync(path.join(run, f)).isFile(), `${f} is a file of the run's own`);
  assert.deepEqual(readFileSync(take), tone, 'the take the link pointed at is untouched');
  assert.ok(!existsSync(nowhere), 'nothing made where the dangling link pointed');
  assert.deepEqual(readFileSync(path.join(run, 'a.unpaced.wav')), tone, 'the unpaced audio kept beside the paced one');
  assert.ok(readFileSync(path.join(run, 'a.wav')).length > tone.length, 'the paced audio, with its tail');
});

test('fitting a voice to a song replaces a link at a scene\'s audio, and never writes the take it points at', t => {
  const run = tempDir('fit', t), victims = tempDir('victims', t), take = path.join(victims, 'take.wav'), tone = toneWav(1);
  writeFileSync(take, tone); symlinkSync(take, path.join(run, 'a.wav'));
  const before = {scenes: [{id: 'a', audio: 'a.wav', duration: 1, words: []}]}, after = {scenes: [{id: 'a', audio: 'a.wav', duration: 1.5, words: []}]};
  assert.equal(fitVoice(run, before, after).scenes[0].duration, 1.5);
  assert.ok(lstatSync(path.join(run, 'a.wav')).isFile(), 'a file of the run\'s own');
  assert.equal(readFileSync(path.join(run, 'a.wav')).length, tone.length + 24000, 'padded by half a second at 24 kHz, 16-bit');
  assert.deepEqual(readFileSync(take), tone, 'the take is untouched');
});

test('the segment store replaces a link planted at a segment\'s file or its manifest, and reuses the segment', t => {
  const dir = tempDir('store', t), work = tempDir('work', t), store = folderStore(dir), key = 'c'.repeat(24);
  const planted = plant(t, dir, [`${key}.mp4`, `${key}.json`]);
  writeFileSync(path.join(work, 'segment.mp4'), 'frames');
  store.put(key, path.join(work, 'segment.mp4'), {frames: 2, samples: {0: '0'.repeat(16), 1: '1'.repeat(16)}});
  replaced(planted);
  const got = store.get(key);
  assert.equal(got.file, path.join(realpathSync(dir), `${key}.mp4`)); assert.equal(got.manifest.bytes, 6);
  assert.deepEqual(parts(dir), []);
});

// The guard. A source file in src/ may write a file only through files.mjs · writeOutput, except where it writes into
// StoryReel's own folder, each such place listed here with where it writes:
//   - by import: only the files in IMPORTS may import an fs function that writes or changes a file (write, open, append,
//     truncate, copy, rename, link, chmod, chown, utimes, a write stream, fs.promises), each by name; fs or
//     child_process taken whole (a default or namespace import, {default as x}, a re-export), loaded at run time (a
//     dynamic import, require, createRequire()(…), any call given the module's name) or reached through
//     process.getBuiltinModule is refused anywhere;
//   - by call: every call of such a function, under whatever local name it was imported as, is one listed in OWN;
//   - by program: every program StoryReel runs (spawn, spawnSync, spawned, exec…, fork — by their local names) is one
//     listed in RUNS, with what it is and where its output goes; and every flag that makes FFmpeg or ffprobe write a
//     file (-y, -report, -progress, -vstats, -vstats_file, -passlogfile, -dump_attachment, -sdp_file, -o, FFREPORT),
//     wherever it is written in src/, is on a line listed in OWN.
// A new write fails until it goes through writeOutput or is listed with its reason; a listed one that is gone fails too.
const WRITERS = ['writeFileSync', 'writeFile', 'openSync', 'open', 'writeSync', 'write', 'writevSync', 'writev', 'appendFileSync', 'appendFile',
  'truncateSync', 'truncate', 'ftruncateSync', 'ftruncate', 'copyFileSync', 'copyFile', 'cpSync', 'cp', 'renameSync', 'rename', 'linkSync', 'link',
  'symlinkSync', 'symlink', 'chmodSync', 'chmod', 'chownSync', 'chown', 'utimesSync', 'utimes', 'createWriteStream', 'promises'];
const RUNNERS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
const FLAGS = ['-y', '-report', '-progress', '-vstats', '-vstats_file', '-passlogfile', '-dump_attachment', '-sdp_file', '-o'];
const IMPORTS = {
  'files.mjs': ['writeFileSync', 'renameSync', 'chmodSync', 'copyFileSync', 'linkSync'],   // the owner: writeOutput, makeFolder, copyVoice, placeVoice
  'pipeline.mjs': ['writeFileSync'], 'render.mjs': ['writeFileSync'], 'segments/join.mjs': ['writeFileSync'], 'stills.mjs': ['writeFileSync'],
  'segments/store.mjs': ['utimesSync'],   // a kept piece's manifest touched when it is reused: its age orders eviction
};
const OWN = [
  ['files.mjs', 'ops.copyFileSync(from, temp, constants.COPYFILE_EXCL)', 'writeOutput: a new random name beside the output, created exclusively'],
  ['files.mjs', 'ops.writeFileSync(temp, what, {flag: \'wx\'})', 'writeOutput: the same'],
  ['files.mjs', 'ops.linkSync(what.copy, temp)', 'writeOutput: the same'],
  ['files.mjs', 'try { make(temp); ops.renameSync(temp, final); }', 'writeOutput: that name renamed onto the output (a rename replaces a link, never follows it)'],
  ['files.mjs', 'try { ops.renameSync(what.move, final); }', 'writeOutput: a move, renamed the same way'],
  ['files.mjs', "writeFileSync(path.join(to, 'timings.json'), bytes, {flag: 'wx'})", 'copyVoice: into the voice copy makeScratch made (0700), exclusively'],
  ['files.mjs', "writeFileSync(target, readFileSync(path.join(base, f)), {flag: 'wx'})", 'copyVoice: the same'],
  ['files.mjs', 'ops.chmodSync(copy, plainFolderMode())', 'placeVoice: the voice copy, before it is renamed'],
  ['files.mjs', 'ops.renameSync(copy, final)', 'placeVoice: the copy renamed onto narration/'],
  ['pipeline.mjs', "writeFileSync(path.join(copy, 'timings.json')", 'the voice copy makeScratch made'],
  ['pipeline.mjs', "if (scope.narration) writeFileSync(path.join(scope.narration, 'timings.json')", 'fit-to-music: the same copy (place-narration, the last stage, makes it narration/)'],
  ['render.mjs', "spawnSync(ffmpeg, ['-y', '-hide_banner'", 'runReporting: the mux, into the work folder (finishRender renames it onto out)'],
  ['render.mjs', "writeFileSync(path.join(dir, 'film-narration.txt')", 'joinVoice: called with the work folder'],
  ['paint.mjs', "spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo'", 'frameEncoder: a picture in the work folder (wholeVideo, segmentedVideo)'],
  ['render.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]", 'finishRender: the sound, in the work folder'],
  ['render.mjs', 'writeFileSync(file, createMotionSound(', 'finishRender: the work folder'],
  ['render.mjs', "writeFileSync(path.join(work, 'film-sfx.txt')", 'finishRender: the work folder'],
  ['render.mjs', 'writeFileSync(introWav, intro.wav)', 'finishRender: the work folder'],
  ['render.mjs', "writeFileSync(path.join(work, 'film-audio.txt')", 'finishRender: the work folder'],
  ['segments/join.mjs', 'writeFileSync(list, concatList(files))', 'ffmpegJoin: beside its out, the joined picture in the work folder'],
  ['segments/join.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat'", 'ffmpegJoin: the same'],
  ['segments/store.mjs', 'utimesSync(json, now, now)', 'folderStore: a reused piece\'s manifest, its times set to now (a piece it checked, in the store it was given)'],
  ['segments/clip.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...inputs", 'writeClip: the review clip, into the render\'s work folder (changes.mjs moves it onto its output with writeOutput)'],
  ['stills.mjs', 'writeFileSync(script, filter)', 'the stills pass\'s tempScratch folder'],
];
const RUNS = [
  ['files.mjs', "spawnSync('/sbin/mount', [], {encoding: 'utf8'})", 'macOS\'s mount table, read once by securePath (to stdout): a reader, it writes nothing'],
  ['mcp.mjs', 'spawn(process.execPath, [CLI, name, ...flags]', 'Node running StoryReel\'s own CLI (src/, held to this guard)'],
  ['spawned.mjs', 'const child = spawn(command, args, options);', 'the wrapper: its callers are listed below'],
  ['beats.mjs', 'spawnSync(ffmpeg, decodeArgs(file, rate)', 'FFmpeg decoding to a pipe'],
  ['beats.mjs', 'spawnSync(ffprobeBeside(ffmpeg), [', 'ffprobe, to stdout'],
  ['beats.mjs', 'spawned(ffmpeg, decodeArgs(file, rate)', 'FFmpeg decoding to a pipe'],
  ['stills.mjs', "spawnSync(ffmpeg, ['-version']", 'FFmpeg\'s version'],
  ['stills.mjs', 'spawned(ffmpeg, args, {stdio:', 'FFmpeg reading stills to a pipe (stills.mjs · stillsArgs)'],
  ['render.mjs', "spawnSync(ffmpeg, ['-y', '-hide_banner'", 'FFmpeg: the mux, into the work folder'],
  ['render.mjs', "spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', wav, '-filter_complex', 'ebur128", 'FFmpeg measuring, to null'],
  ['paint.mjs', "spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo'", 'FFmpeg encoding into the work folder'],
  ['paint.mjs', "spawnSync(ffmpeg, ['-version']", 'FFmpeg naming its version and build (encoderOf), to stdout'],
  ['render.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]", 'FFmpeg: the sound, in the work folder'],
  ['render.mjs', "spawnSync(ffmpeg, ['-hide_banner', '-nostdin', '-i', file]", 'FFmpeg reading a song\'s length, no output'],
  ['finished.mjs', 'spawnSync(cmd, args, {encoding:', 'ffprobe / FFmpeg reading a file, to stdout'],
  ['finished.mjs', "spawned(ffmpeg, ['-v', 'error', '-i', file, '-vf', vf, '-f', 'rawvideo', 'pipe:1']", 'FFmpeg frames to a pipe'],
  ['finished.mjs', "spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vn', '-ac', '1'", 'FFmpeg sound to a pipe'],
  ['finished.mjs', "spawned(ffmpeg, ['-hide_banner', '-nostats', '-v', 'info', '-reinit_filter'", 'FFmpeg frames to a pipe'],
  ['segments/join.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat'", 'FFmpeg joining into the work folder (the stamp, when there is one, burned over it)'],
  ['segments/clip.mjs', "spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...inputs", 'FFmpeg writing a review clip into the work folder (storyreel changes --render)'],
  ['render.mjs', "spawnSync(ffmpeg, ['-hide_banner', '-nostdin', ...AUDIO_ONLY", 'FFmpeg measuring a found sound\'s peak (volumedetect), to null'],
  ['sounds/index.mjs', "spawnSync(ffprobe, ['-v', 'error', ...AUDIO_ONLY", 'ffprobe reading a fetched sound (probeAudio), to stdout'],
];
const MODULE = String.raw`(?:node:)?(?:fs(?:/promises)?|child_process)`, QUOTED = String.raw`[\x60'"]${MODULE}[\x60'"]`;
const isFs = spec => /^(?:node:)?fs(?:\/promises)?$/.test(spec), isCp = spec => /^(?:node:)?child_process$/.test(spec);
/** What a source file takes from fs and child_process: each name and its local name, and every way it takes a module whole or late. */
function moduleUse(code) {
  const named = [], whole = [];
  for (const m of code.matchAll(new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]`, 'g'))) {
    if (!isFs(m[2]) && !isCp(m[2])) continue;
    for (const part of m[1].split(',').map(p => p.trim()).filter(Boolean)) {
      const [name, local = name] = part.split(/\s+as\s+/).map(x => x.trim());
      if (name === 'default') whole.push(`{default as ${local}} from '${m[2]}'`); else named.push({module: isFs(m[2]) ? 'fs' : 'cp', name, local});
    }
  }
  for (const m of code.matchAll(new RegExp(String.raw`import\s+(?:\*\s*as\s+\w+|\w+)\s*(?:,\s*(?:\{[^}]*\}|\*\s*as\s+\w+))?\s*from\s*` + QUOTED, 'g'))) whole.push(m[0].replace(/\s+/g, ' '));
  for (const m of code.matchAll(new RegExp(String.raw`export\s*(?:\*(?:\s*as\s+\w+)?|\{[^}]*\})\s*from\s*` + QUOTED, 'g'))) whole.push(m[0].replace(/\s+/g, ' '));
  for (const m of code.matchAll(new RegExp(String.raw`\(\s*` + QUOTED + String.raw`\s*\)`, 'g'))) whole.push(`a call given ${m[0].replace(/\s+/g, '')} (import(), require(), createRequire()(…))`);
  for (const m of code.matchAll(/getBuiltinModule/g)) whole.push('process.getBuiltinModule');
  return {named, whole};
}
const srcFiles = () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const walk = (at = '') => readdirSync(path.join(src, at), {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(at, e.name)) : e.name.endsWith('.mjs') ? [path.join(at, e.name)] : []);
  return walk().map(file => ({file, code: readFileSync(path.join(src, file), 'utf8')}));
};
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const callsOf = names => new RegExp(String.raw`(?<![\w.$])(${names.map(escape).join('|') || '(?!)'})\s*\(`);
const flagged = new RegExp(String.raw`[\x60'"](${FLAGS.map(escape).join('|')})[\x60'"]|\bFFREPORT\b`);   // a flag as written, or FFmpeg's report variable

/** Every way src/ could write a file around writeOutput, or run a program not listed (empty when there is none). */
function rawWrites(files = srcFiles()) {
  const problems = [];
  for (const {file, code} of files) {
    const {named, whole} = moduleUse(code), allowed = IMPORTS[file] ?? [];
    for (const w of whole) problems.push(`${file}: ${w} — import fs and child_process functions by name`);
    const writers = named.filter(n => n.module === 'fs' && WRITERS.includes(n.name));
    for (const {name} of writers.filter(n => !allowed.includes(n.name))) problems.push(`${file}: imports ${name}, which writes a file — write the output through files.mjs · writeOutput`);
    for (const name of allowed.filter(n => !writers.some(w => w.name === n))) problems.push(`${file}: listed as importing ${name}, and it does not — remove it from IMPORTS`);
    // The programs: child_process's runners and spawned.mjs's wrapper, by the names this file gives them.
    const runners = [...named.filter(n => n.module === 'cp' && RUNNERS.includes(n.name)).map(n => n.local),
      ...[...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/spawned\.mjs['"]/g)].flatMap(m => m[1].split(',').map(p => p.trim().split(/\s+as\s+/)).filter(([n]) => n === 'spawned').map(([n, l = n]) => l))];
    const writes = callsOf(writers.map(n => n.local)), runs = callsOf(runners);
    code.split('\n').forEach((line, i) => {
      const text = line.trim(), at = `${file}:${i + 1} ${text.slice(0, 120)}`;
      if (text.startsWith('//') || text.startsWith('/*') || text.startsWith('*')) return;
      if ((writes.test(text) || flagged.test(text)) && !OWN.some(([f, has]) => f === file && text.includes(has))) problems.push(`${at} — write the output through files.mjs · writeOutput, or list it in OWN with where it writes`);
      if (runs.test(text) && !RUNS.some(([f, has]) => f === file && text.includes(has))) problems.push(`${at} — a program StoryReel runs: list it in RUNS with what it is and where its output goes`);
    });
  }
  for (const [list, entries] of [['OWN', OWN], ['RUNS', RUNS]]) for (const [f, has] of entries) if (!files.some(({file, code}) => file === f && code.includes(has))) problems.push(`${f}: "${has}" is listed in ${list} and gone — remove it`);
  return problems;
}

test('no write in src/ goes around writeOutput, and every program it runs is listed: by import, by call (under any local name), by flag', () => {
  assert.deepEqual(rawWrites(), []);
});

test('the guard catches each way around it, planted in src/: openSync + writeSync, a local alias, {default as fs}, getBuiltinModule, createRequire, a template import, fs/promises, an unlisted program, a writing FFmpeg flag', () => {
  const files = srcFiles(), plant = (file, edit) => files.map(f => f.file === file ? {file, code: edit(f.code)} : f);
  const caught = (planted, re) => { const found = rawWrites(planted); assert.ok(found.some(p => re.test(p)), `not caught: ${re}\n${found.join('\n')}`); return found; };
  const fsImport = "import {writeFileSync, rmSync} from 'node:fs';";
  assert.ok(files.find(f => f.file === 'render.mjs').code.includes(fsImport), 'render.mjs imports fs as the plants expect');
  // openSync + writeSync in render.mjs, in place of the chapters' writeOutput: both imports and the line.
  const opened = rawWrites(plant('render.mjs', c => c.replace(fsImport, "import {writeFileSync, rmSync, openSync, writeSync} from 'node:fs';").replace("writeOutput(path.join(dir, 'chapters.txt'), ", "writeSync(openSync(path.join(dir, 'chapters.txt'), 'w'), ")));
  assert.equal(opened.length, 3, opened.join('\n'));
  assert.match(opened[0], /^render\.mjs: imports openSync, which writes a file — write the output through files\.mjs · writeOutput$/);
  assert.match(opened[1], /^render\.mjs: imports writeSync, which writes a file/);
  assert.match(opened[2], /^render\.mjs:\d+ writeSync\(openSync\(path\.join\(dir, 'chapters\.txt'\), 'w'\), .* — write the output through files\.mjs · writeOutput, or list it in OWN/);
  // A writer it may import, called under another name.
  caught(plant('render.mjs', c => c.replace(fsImport, "import {writeFileSync, writeFileSync as put, rmSync} from 'node:fs';").replace("writeOutput(path.join(dir, 'chapters.txt'), ", "put(path.join(dir, 'chapters.txt'), ")), /^render\.mjs:\d+ put\(path\.join\(dir, 'chapters\.txt'\)/);
  // fs taken whole, or late.
  caught(plant('tools.mjs', c => `import {default as fs} from 'node:fs';\n${c}`), /^tools\.mjs: \{default as fs\} from 'node:fs' — import fs and child_process functions by name$/);
  caught(plant('tools.mjs', c => `${c}\nconst fs = process.getBuiltinModule('node:fs');\n`), /^tools\.mjs: process\.getBuiltinModule/);
  caught(plant('tools.mjs', c => `import {createRequire} from 'node:module';\n${c}\nconst fs = createRequire(import.meta.url)('node:fs');\n`), /^tools\.mjs: a call given \('node:fs'\)/);
  caught(plant('tools.mjs', c => `${c}\nconst later = () => import(\x60node:fs\x60);\n`), /^tools\.mjs: a call given \(\x60node:fs\x60\)/);
  caught(plant('tools.mjs', c => `import * as cp from 'node:child_process';\n${c}`), /^tools\.mjs: import \* as cp from 'node:child_process'/);
  caught(plant('tools.mjs', c => `export * from 'node:fs';\n${c}`), /^tools\.mjs: export \* from 'node:fs'/);
  caught(plant('tools.mjs', c => `import {open} from 'node:fs/promises';\n${c}`), /^tools\.mjs: imports open, which writes a file/);
  caught(plant('tools.mjs', c => `import {promises as fsp} from 'fs';\n${c}`), /^tools\.mjs: imports promises, which writes a file/);
  // A program not listed (curl writing a file), under its own name and under another.
  caught(plant('tools.mjs', c => `import {spawnSync} from 'node:child_process';\n${c}\nspawnSync('curl', ['-o', 'film.mp4', 'https://example.com']);\n`), /^tools\.mjs:\d+ spawnSync\('curl'.* — a program StoryReel runs: list it in RUNS/);
  caught(plant('tools.mjs', c => `import {execFileSync as run} from 'node:child_process';\n${c}\nrun('cp', ['a', 'b']);\n`), /^tools\.mjs:\d+ run\('cp', \['a', 'b'\]\);/);
  // A flag that makes FFmpeg or ffprobe write a file, wherever it is written.
  for (const flag of ['-progress', '-report', '-vstats_file', '-y']) caught(plant('beats.mjs', c => `${c}\nconst extra = ['${flag}', 'out.txt'];\n`), new RegExp(`^beats\\.mjs:\\d+ const extra = \\['${escape(flag)}'`));
  caught(plant('beats.mjs', c => `${c}\nconst env = {FFREPORT: 'file=report.log'};\n`), /^beats\.mjs:\d+ const env = \{FFREPORT/);
});
