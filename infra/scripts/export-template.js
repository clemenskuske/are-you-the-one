const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const infraPath = path.resolve(__dirname, '..');
const cdkBinary = path.join(
  infraPath,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'cdk.cmd' : 'cdk'
);
const cdkOutPath = path.join(infraPath, 'cdk.out');
const exportPath = path.join(infraPath, 'dist');

function synthesize() {
  execFileSync(cdkBinary, ['synth', '--output', cdkOutPath], {
    cwd: infraPath,
    stdio: 'inherit',
  });
}

function readManifest() {
  const manifestPath = path.join(cdkOutPath, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`CDK manifest not found at ${manifestPath}.`);
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function getStackArtifacts(manifest) {
  return Object.entries(manifest.artifacts ?? {}).filter(
    ([, artifact]) => artifact.type === 'aws:cloudformation:stack'
  );
}

function exportTemplates(stackArtifacts) {
  fs.mkdirSync(exportPath, { recursive: true });

  for (const [artifactId, artifact] of stackArtifacts) {
    const templateFile = artifact.properties?.templateFile;

    if (!templateFile) {
      throw new Error(`No template file found for stack artifact ${artifactId}.`);
    }

    const sourcePath = path.join(cdkOutPath, templateFile);
    const destinationPath = path.join(exportPath, `${artifactId}.template.json`);

    fs.copyFileSync(sourcePath, destinationPath);
    console.log(`Exported ${artifactId} to ${destinationPath}`);
  }
}

function main() {
  synthesize();

  const manifest = readManifest();
  const stackArtifacts = getStackArtifacts(manifest);

  if (stackArtifacts.length === 0) {
    throw new Error('No CloudFormation stack artifacts were found in cdk.out.');
  }

  exportTemplates(stackArtifacts);
}

main();
