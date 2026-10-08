"""Independent ZIP reader, CRC/hash verifier and bounded safe extractor."""
import argparse
import hashlib
import json
import pathlib
import re
import stat
import zipfile


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(name):
    if (not isinstance(name, str) or not name or len(name) > 240
            or re.search(r'[\\\x00-\x1f\x7f:]', name) or name.startswith('/')
            or any(part in ('', '.', '..') for part in name.split('/'))):
        raise ValueError(f'Unsafe ZIP path: {name!r}')
    return name


def verify(source, destination, workspace):
    runtime = (workspace / '.runtime').resolve()
    destination = destination.resolve()
    if not destination.is_relative_to(runtime) or destination == runtime:
        raise ValueError('Extraction must target a named directory inside project .runtime')
    source_manifest = (source / 'delivery-manifest.json').read_bytes()
    manifest = json.loads(source_manifest)
    if manifest.get('format') != 'tidewater-scene-delivery.v1':
        raise ValueError('Unsupported delivery manifest')
    verified = []
    with zipfile.ZipFile(source / 'project.zip') as archive:
        members = archive.infolist()
        names = [safe_name(member.filename) for member in members]
        if len(set(names)) != len(names):
            raise ValueError('Duplicate ZIP members')
        if sum(member.file_size for member in members) > 256 * 1024 * 1024:
            raise ValueError('ZIP expands beyond the delivery size limit')
        if any(member.is_dir() or stat.S_ISLNK(member.external_attr >> 16) or member.flag_bits & 1 for member in members):
            raise ValueError('ZIP directories, symlinks and encryption are not accepted')
        corrupted = archive.testzip()
        if corrupted is not None:
            raise ValueError(f'ZIP CRC failed: {corrupted}')
        if archive.read('delivery-manifest.json') != source_manifest:
            raise ValueError('Archive manifest differs from disk manifest')
        expected = [safe_name(record['path']) for record in manifest['files']]
        if len(set(expected)) != len(expected) or set(names) != set(expected) | {'delivery-manifest.json'}:
            raise ValueError('ZIP inventory differs from exact manifest inventory')
        for record in manifest['files']:
            data = archive.read(record['path'])
            actual = sha256(data)
            if len(data) != record['bytes'] or actual != record['sha256']:
                raise ValueError(f'Manifest size/hash mismatch: {record["path"]}')
            verified.append({'path': record['path'], 'bytes': len(data), 'sha256': actual})
        disk_glb = (source / 'scene.glb').read_bytes()
        if archive.read('scene.glb') != disk_glb:
            raise ValueError('ZIP GLB differs from disk GLB')
        # Validate every final resolved path before creating any directories.
        targets = []
        for name in names:
            target = (destination / name).resolve()
            if not target.is_relative_to(destination):
                raise ValueError(f'ZIP entry escapes extraction root: {name}')
            for parent in (destination, *target.parents):
                if parent == runtime.parent:
                    break
                if parent.is_symlink():
                    raise ValueError(f'Extraction traverses a symlink: {parent}')
            targets.append(target)
        destination.mkdir(parents=True, exist_ok=True)
        for member, target in zip(members, targets):
            data = archive.read(member.filename)
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                if not target.is_file() or target.read_bytes() != data:
                    raise ValueError(f'Refusing to overwrite a different extracted file: {target}')
            else:
                with target.open('xb') as stream:
                    stream.write(data)
    return {'passed': True, 'independentReader': 'Python zipfile', 'crcAllEntries': True,
            'exactInventory': True, 'manifestFiles': len(verified), 'archiveEntries': len(members),
            'allManifestBytesAndSHA256': True, 'archiveManifestMatchesDisk': True,
            'archiveGLBMatchesDisk': True, 'glbSHA256': sha256(disk_glb),
            'zipSHA256': sha256((source / 'project.zip').read_bytes()),
            'safeExtractionRoot': str(destination), 'files': verified}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=pathlib.Path)
    parser.add_argument('destination', type=pathlib.Path)
    parser.add_argument('workspace', type=pathlib.Path)
    arguments = parser.parse_args()
    print(json.dumps(verify(arguments.source.resolve(), arguments.destination, arguments.workspace.resolve()), ensure_ascii=True))
