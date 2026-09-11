const fs = require('node:fs');
const path = require('node:path');

/** electron-builder hook: embed the already-built native WidgetKit extension. */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const widget = path.join(
    context.packager.projectDir,
    'native', 'macos-widget', 'build', 'Build', 'Products', 'Release',
    'Miku Salary Widget Host.app', 'Contents', 'PlugIns', 'SalaryClockWidget.appex',
  );
  if (!fs.existsSync(widget)) {
    throw new Error('WidgetKit extension is missing. Run npm run native:widget on macOS before packaging.');
  }

  const appBundle = fs.readdirSync(context.appOutDir)
    .find((name) => name.endsWith('.app') && name.startsWith('Miku Salary'));
  if (!appBundle) throw new Error(`Could not locate the packaged app in ${context.appOutDir}`);

  const pluginsFolder = path.join(context.appOutDir, appBundle, 'Contents', 'PlugIns');
  fs.mkdirSync(pluginsFolder, { recursive: true });
  fs.cpSync(widget, path.join(pluginsFolder, 'SalaryClockWidget.appex'), { recursive: true, force: true });
};
