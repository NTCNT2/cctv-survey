import { ACTIONS, can } from '@cctv/shared';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { AppController } from '../app.controller.js';
import { CameraModelsController } from '../camera-models/camera-models.controller.js';
import { CamerasController } from '../cameras/cameras.controller.js';
import { PhotosController } from '../photos/photos.controller.js';
import { ProjectsController } from '../projects/projects.controller.js';
import { SitesController } from '../sites/sites.controller.js';
import { UsersController } from '../users/users.controller.js';
import { AuthController } from './auth.controller.js';
import { AUTHENTICATED_KEY, PERMISSION_KEY, PUBLIC_KEY } from './decorators.js';

const CONTROLLERS = [
  AppController,
  AuthController,
  UsersController,
  ProjectsController,
  SitesController,
  CamerasController,
  CameraModelsController,
  PhotosController,
];

/** 'public', 'authenticated', or a permission action. */
type Rule = string;

/** Collects the access rule of every route handler, method-level over class-level. */
function routeRules(): Map<string, Rule[]> {
  const out = new Map<string, Rule[]>();
  for (const ctrl of CONTROLLERS) {
    const proto = ctrl.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const fn = proto[name];
      if (name === 'constructor' || typeof fn !== 'function') continue;
      if (Reflect.getMetadata(PATH_METADATA, fn) === undefined) continue;
      const rules: Rule[] = [];
      for (const target of [fn, ctrl]) {
        if (Reflect.getMetadata(PUBLIC_KEY, target)) rules.push('public');
        if (Reflect.getMetadata(AUTHENTICATED_KEY, target))
          rules.push('authenticated');
        const p = Reflect.getMetadata(PERMISSION_KEY, target) as
          string | undefined;
        if (p) rules.push(p);
      }
      out.set(`${ctrl.name}.${name}`, rules);
    }
  }
  return out;
}

describe('route access rules', () => {
  const rules = routeRules();

  it('finds every route', () => {
    // 1 health + 4 auth + 5 users + 15 CRUD + 3 camera models + 5 photos
    expect(rules.size).toBe(33);
  });

  it('every route declares exactly one access rule', () => {
    for (const [route, r] of rules) {
      expect({ route, rules: r.length }).toEqual({ route, rules: 1 });
    }
  });

  it('only health, login and logout are public', () => {
    const pub = [...rules].filter(([, r]) => r[0] === 'public').map(([k]) => k);
    expect(pub.sort()).toEqual(
      [
        'AppController.getHealth',
        'AuthController.login',
        'AuthController.logout',
      ].sort(),
    );
  });

  it('every permission used is a known action', () => {
    for (const [, [r]] of rules) {
      if (r !== 'public' && r !== 'authenticated') {
        expect(ACTIONS).toContain(r);
      }
    }
  });
});

describe('permission table (D1)', () => {
  it.each([
    ['viewer', ['project:read', 'site:read', 'camera:read']],
    [
      'surveyor',
      [
        'project:read',
        'project:write',
        'site:read',
        'site:write',
        'site:delete',
        'camera:read',
        'camera:write',
        'camera:delete',
      ],
    ],
    ['admin', [...ACTIONS]],
  ] as const)('%s', (role, granted) => {
    for (const action of ACTIONS) {
      expect({ action, ok: can(role, action) }).toEqual({
        action,
        ok: (granted as readonly string[]).includes(action),
      });
    }
  });
});
