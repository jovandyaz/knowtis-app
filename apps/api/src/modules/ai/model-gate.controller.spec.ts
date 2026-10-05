import 'reflect-metadata';

import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createValidationPipe } from '../../config/validation-pipe';
import { ModelGateService } from './application/services/model-gate.service';
import { ModelGateController } from './model-gate.controller';

const GATE_TOKEN = 'g'.repeat(64);
const GATE_PATH = '/api/v1/internal/model-gate';
const MODEL_ID = 'openrouter:vendor/model-x';
const RUN_URL = 'https://github.com/jovandyaz/knowtis-app/actions/runs/42';

const VALID_VERDICT = {
  selectorKey: 'platform.fast',
  modelId: MODEL_ID,
  passed: true,
  runUrl: RUN_URL,
};

const GATE_ROUTES = [
  ['GET', '/pending', undefined],
  ['GET', '/active', undefined],
  ['POST', '/verdict', VALID_VERDICT],
] as const;

describe('ModelGateController over HTTP', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  const gate = {
    pending: vi.fn(),
    active: vi.fn(),
    verdict: vi.fn(),
  };

  async function call(
    method: string,
    path: string,
    body?: unknown,
    authorization: string | null = `Bearer ${GATE_TOKEN}`
  ) {
    const response = await fetch(`${baseUrl}${GATE_PATH}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(authorization === null ? {} : { authorization }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ModelGateController],
      providers: [
        { provide: ModelGateService, useValue: gate },
        { provide: ConfigService, useValue: { get: () => GATE_TOKEN } },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
      prefix: 'v',
    });
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(GATE_ROUTES)(
    'answers 401 to %s %s without the gate token',
    async (method, path, body) => {
      const response = await call(method, path, body, null);

      expect(response.status).toBe(401);
      expect(gate.pending).not.toHaveBeenCalled();
      expect(gate.active).not.toHaveBeenCalled();
      expect(gate.verdict).not.toHaveBeenCalled();
    }
  );

  it('serves the selectors awaiting a verdict', async () => {
    const pending = [{ selectorKey: 'platform.balanced', modelId: MODEL_ID }];
    gate.pending.mockResolvedValue(pending);

    expect(await call('GET', '/pending')).toEqual({
      status: 200,
      body: pending,
    });
  });

  it('serves the model each intent serves in production', async () => {
    const active = {
      fast: 'openrouter:vendor/fast',
      balanced: 'openrouter:vendor/balanced',
      powerful: 'openrouter:vendor/powerful',
    };
    gate.active.mockResolvedValue(active);

    expect(await call('GET', '/active')).toEqual({ status: 200, body: active });
  });

  it('rejects a verdict with a javascript: run url', async () => {
    const response = await call('POST', '/verdict', {
      ...VALID_VERDICT,
      runUrl: 'javascript:alert(document.cookie)',
    });

    expect(response.status).toBe(400);
    expect(gate.verdict).not.toHaveBeenCalled();
  });

  it("rejects passed given as the string 'true'", async () => {
    const response = await call('POST', '/verdict', {
      ...VALID_VERDICT,
      passed: 'true',
    });

    expect(response.status).toBe(400);
    expect(gate.verdict).not.toHaveBeenCalled();
  });

  it('rejects a verdict for a selector that is not a platform intent', async () => {
    const response = await call('POST', '/verdict', {
      ...VALID_VERDICT,
      selectorKey: 'platform.unknown',
    });

    expect(response.status).toBe(400);
    expect(gate.verdict).not.toHaveBeenCalled();
  });

  it('forwards a valid verdict to the service', async () => {
    const verdict = {
      ...VALID_VERDICT,
      passed: false,
      detail: 'default-model leg failed 3 of 40 cases',
    };
    gate.verdict.mockResolvedValue({ applied: false, reason: 'not_pending' });

    const response = await call('POST', '/verdict', verdict);

    expect(response).toEqual({
      status: 200,
      body: { applied: false, reason: 'not_pending' },
    });
    expect(gate.verdict).toHaveBeenCalledTimes(1);
    expect({ ...gate.verdict.mock.calls[0]?.[0] }).toStrictEqual(verdict);
  });
});
