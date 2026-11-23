import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** All files created or used by tests live in this folder and nowhere else. */
export const TEST_DATA_DIR = join(tmpdir(), 'FraiTube-tests')
