// electron-builder afterPack: macOS-App ad-hoc signieren.
// Ohne Apple-Entwicklerzertifikat ist das Bundle sonst nicht versiegelt und macOS meldet
// nach dem Download „beschädigt“. Ad-hoc signiert erscheint stattdessen der übliche
// „Öffnen“-Dialog (Rechtsklick → Öffnen).
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // Universal-Build: Die x64-/arm64-Zwischenstände (…-temp) müssen unsigniert und identisch bleiben,
  // sonst schlägt das Zusammenführen fehl. Signiert wird nur die fertige Universal-App.
  if (context.appOutDir.endsWith('-temp')) return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log(`  • ad-hoc signiert  ${appPath}`);
};
