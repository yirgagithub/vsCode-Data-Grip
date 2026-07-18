import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { projectPublicSurface } from '../scripts/compatibility/publicSurface';

describe('public surface compatibility', () => {
  it('preserves the reviewed command, activation, menu, keybinding, and settings surface', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    const expected = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/compatibility/public-surface.json'), 'utf8'));

    expect(projectPublicSurface(pkg)).toEqual(expected);
  });

  it('preserves semantic array order', () => {
    const projected = projectPublicSurface({
      contributes: {
        configuration: {
          properties: {
            'database.mode': {
              type: 'string',
              enum: ['z-last', 'a-first'],
              enumDescriptions: ['Z description', 'A description']
            }
          }
        },
        menus: {
          'editor/context': [
            { when: 'first', command: 'database.first' },
            { when: 'second', command: 'database.second' }
          ]
        },
        keybindings: [
          { when: 'first', key: 'ctrl+k', command: 'database.first' },
          { when: 'second', key: 'ctrl+k', command: 'database.second' }
        ]
      }
    });

    expect(projected.configuration['database.mode'].enum).toEqual(['z-last', 'a-first']);
    expect(projected.configuration['database.mode'].enumDescriptions).toEqual(['Z description', 'A description']);
    expect(projected.menus['editor/context'].map((item: { command: string }) => item.command)).toEqual([
      'database.first',
      'database.second'
    ]);
    expect(projected.keybindings.map((item: { command: string }) => item.command)).toEqual([
      'database.first',
      'database.second'
    ]);
  });

  it('sorts unordered collections deterministically with code-unit ordering', () => {
    const projected = projectPublicSurface({
      activationEvents: ['z-event', 'ä-event', 'a-event'],
      contributes: {
        commands: [
          { title: 'Umlaut', command: 'ä-command' },
          { title: 'Zulu', command: 'z-command' },
          { title: 'Alpha', command: 'a-command' }
        ]
      }
    });

    expect(projected.activationEvents).toEqual(['a-event', 'z-event', 'ä-event']);
    expect(projected.commands.map((item: { command: string }) => item.command)).toEqual([
      'a-command',
      'z-command',
      'ä-command'
    ]);
  });

  it('uses canonical top-level and nested object key ordering', () => {
    const projected = projectPublicSurface({
      contributes: {
        commands: [{ title: 'Alpha', command: 'a-command' }],
        menus: {
          'editor/context': [{ when: 'editorTextFocus', command: 'a-command' }]
        },
        configuration: {
          properties: {
            'database.mode': { type: 'string', enumDescriptions: ['Alpha'], enum: ['a'] }
          }
        }
      }
    });

    expect(Object.keys(projected)).toEqual([
      'activationEvents',
      'commands',
      'menus',
      'keybindings',
      'configuration'
    ]);
    expect(Object.keys(projected.commands[0])).toEqual(['command', 'title']);
    expect(Object.keys(projected.configuration['database.mode'])).toEqual(['enum', 'enumDescriptions', 'type']);
    expect(Object.keys(projected.menus['editor/context'][0])).toEqual(['command', 'when']);
  });

  it('uses stable defaults when manifest sections are absent', () => {
    expect(projectPublicSurface({})).toEqual({
      activationEvents: [],
      commands: [],
      menus: {},
      keybindings: [],
      configuration: {}
    });
  });

  it('does not mutate its input', () => {
    const pkg = {
      activationEvents: ['z-event', 'a-event'],
      contributes: {
        commands: [{ title: 'Zulu', command: 'z-command' }, { title: 'Alpha', command: 'a-command' }],
        configuration: {
          properties: {
            'database.mode': { type: 'string', enum: ['z-last', 'a-first'] }
          }
        }
      }
    };
    const before = JSON.parse(JSON.stringify(pkg));

    projectPublicSurface(pkg);

    expect(pkg).toEqual(before);
  });
});
