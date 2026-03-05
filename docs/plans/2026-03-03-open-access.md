# Open Access: Usuarios Anónimos con AI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que cualquier persona use Knowtis sin registrarse — incluyendo AI — con persistencia server-side vía anonymous ID, y registro como upgrade para sync, colaboración y más notas.

**Architecture:** Modelo híbrido 3.5 — se genera un `anonymous_id` en localStorage al primer uso. El backend crea un "usuario anónimo" real en la tabla `users` con `provider: 'anonymous'`. Las notas se persisten en servidor vinculadas a este usuario. Límites: 5 notas, 3 AI requests/día. Al registrarse, las notas anónimas migran a la cuenta real.

**Tech Stack:** React 19, TanStack Router, Zustand, NestJS 11, Drizzle ORM, PostgreSQL, JWT (optional auth)

---

## Contexto: Estado Actual

- **Rutas protegidas:** Todo bajo `/_authenticated` requiere login → redirect a `/login`
- **Excepción existente:** `/s/$token` (shared notes) ya funciona sin auth
- **Backend:** `JwtAuthGuard` + `@Public()` decorator. `@Public()` exempta rutas del guard
- **Permisos:** `defineAbilityFor(null, ctx)` ya contempla usuario null (solo read público)
- **WebSocket:** Ya soporta usuarios anónimos (`type: 'anonymous'`)
- **AI:** Requiere `JwtAuthGuard` + userId para rate limiting y usage tracking
- **DB:** `notes.ownerId` tiene FK a `users.id` con `NOT NULL` — los anónimos NECESITAN un user row

## Decisiones de Diseño

1. **Los anónimos son usuarios reales** en la DB — `provider: 'anonymous'`, email generado (`anon-{uuid}@anonymous.knowtis.local`). Esto reutiliza toda la infra existente (ownerId FK, AI usage tracking, permissions).
2. **Token JWT efímero** para anónimos — se emite sin password, dura 30 días. Se guarda en localStorage. Permite reusar `JwtAuthGuard` + `@CurrentUser()` sin cambios en los controllers.
3. **Migración al registrarse** — las notas del anónimo se re-asignan al nuevo usuario. El user anónimo se elimina.
4. **Límites** — anónimos: 5 notas, 3 AI requests/día. Registrados: sin límite de notas, límites AI normales.

---

## Task 1: Schema — Agregar campo `isAnonymous` a users

**Files:**

- Modify: `apps/api/src/database/schema/users.schema.ts:12-38`
- Create: `apps/api/src/database/migrations/XXXX_add_anonymous_users.sql`

**Step 1: Agregar campo al schema de Drizzle**

En `apps/api/src/database/schema/users.schema.ts`, agregar campo `isAnonymous`:

```typescript
// Dentro de la definición de columns de users:
isAnonymous: boolean('is_anonymous').notNull().default(false),
```

Ubicar después de `locale` (línea 22), antes de `createdAt`.

**Step 2: Generar y revisar la migración**

```bash
pnpm nx run api:db:generate
```

Revisar el SQL generado. Debe contener:

```sql
ALTER TABLE "users" ADD COLUMN "is_anonymous" boolean NOT NULL DEFAULT false;
```

**Step 3: Aplicar migración en local**

```bash
pnpm db:push
```

Expected: Schema actualizado sin errores.

**Step 4: Commit**

```bash
git add apps/api/src/database/schema/users.schema.ts apps/api/src/database/migrations/
git commit -m "feat(auth): add isAnonymous field to users schema"
```

---

## Task 2: Backend — Servicio de usuarios anónimos

**Files:**

- Create: `apps/api/src/modules/auth/application/services/anonymous-auth.service.ts`
- Create: `apps/api/src/modules/auth/application/services/anonymous-auth.service.spec.ts`

**Step 1: Escribir test del servicio**

```typescript
// anonymous-auth.service.spec.ts
import { Test } from '@nestjs/testing';

import { AnonymousAuthService } from './anonymous-auth.service';

describe('AnonymousAuthService', () => {
  let service: AnonymousAuthService;
  const mockUserRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
  };
  const mockJwtService = { sign: vi.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AnonymousAuthService,
        { provide: 'USER_REPOSITORY', useValue: mockUserRepository },
        { provide: 'JwtService', useValue: mockJwtService },
      ],
    }).compile();
    service = module.get(AnonymousAuthService);
  });

  describe('createAnonymousSession', () => {
    it('should create an anonymous user and return JWT', async () => {
      const mockUser = {
        id: 'uuid-123',
        email: 'anon-uuid-123@anonymous.knowtis.local',
        isAnonymous: true,
      };
      mockUserRepository.create.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('jwt-token');

      const result = await service.createAnonymousSession();

      expect(result.user.isAnonymous).toBe(true);
      expect(result.accessToken).toBe('jwt-token');
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'anonymous', isAnonymous: true })
      );
    });
  });

  describe('migrateToRegistered', () => {
    it('should reassign notes from anonymous user to new user', async () => {
      // Test that notes are migrated and anonymous user is deleted
    });
  });
});
```

**Step 2: Correr test para verificar que falla**

```bash
pnpm nx test api -- --testPathPattern=anonymous-auth
```

Expected: FAIL — módulo no existe aún.

**Step 3: Implementar el servicio**

```typescript
// anonymous-auth.service.ts
import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';

import { DatabaseService } from '../../../../database/database.service';
import { aiUsage } from '../../../../database/schema/ai-usage.schema';
import { notes } from '../../../../database/schema/notes.schema';
import { users } from '../../../../database/schema/users.schema';

@Injectable()
export class AnonymousAuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService
  ) {}

  async createAnonymousSession() {
    const anonId = randomUUID();
    const email = `anon-${anonId}@anonymous.knowtis.local`;

    const [user] = await this.db.connection
      .insert(users)
      .values({
        email,
        name: 'Anonymous',
        provider: 'anonymous',
        isAnonymous: true,
      })
      .returning();

    const accessToken = this.jwtService.sign(
      { sub: user.id, isAnonymous: true },
      { expiresIn: '30d' }
    );

    return { user, accessToken };
  }

  async migrateAnonymousData(
    anonymousUserId: string,
    registeredUserId: string
  ): Promise<void> {
    await this.db.connection.transaction(async (tx) => {
      // Reasignar notas
      await tx
        .update(notes)
        .set({ ownerId: registeredUserId })
        .where(eq(notes.ownerId, anonymousUserId));

      // Reasignar AI usage
      await tx
        .update(aiUsage)
        .set({ userId: registeredUserId })
        .where(eq(aiUsage.userId, anonymousUserId));

      // Eliminar usuario anónimo
      await tx.delete(users).where(eq(users.id, anonymousUserId));
    });
  }
}
```

**Step 4: Correr tests**

```bash
pnpm nx test api -- --testPathPattern=anonymous-auth
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/auth/application/services/anonymous-auth*
git commit -m "feat(auth): add anonymous auth service with migration support"
```

---

## Task 3: Backend — Endpoint de sesión anónima

**Files:**

- Modify: `apps/api/src/modules/auth/auth-session.controller.ts:40-167`
- Modify: `apps/api/src/modules/auth/auth.module.ts` (registrar servicio)

**Step 1: Escribir test e2e del endpoint**

Crear test que verifique:

- `POST /api/v1/auth/anonymous` devuelve `{ user, accessToken }` sin credenciales
- El user tiene `isAnonymous: true`
- El token JWT es válido y permite acceso a endpoints protegidos

**Step 2: Agregar endpoint al controller**

En `apps/api/src/modules/auth/auth-session.controller.ts`, agregar:

```typescript
@Public()
@Post('anonymous')
@HttpCode(HttpStatus.CREATED)
async createAnonymousSession(@Res({ passthrough: true }) res: Response) {
  const result = await this.anonymousAuthService.createAnonymousSession();
  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      isAnonymous: true,
    },
    accessToken: result.accessToken,
  };
}
```

**Step 3: Registrar `AnonymousAuthService` en el módulo auth**

En `auth.module.ts`, agregar `AnonymousAuthService` a `providers` y asegurar acceso a `DatabaseService` y `JwtService`.

**Step 4: Probar manualmente**

```bash
curl -X POST http://localhost:3333/api/v1/auth/anonymous
```

Expected: `201 Created` con `{ user: { id, name, isAnonymous: true }, accessToken: "eyJ..." }`

**Step 5: Commit**

```bash
git add apps/api/src/modules/auth/
git commit -m "feat(auth): add anonymous session endpoint POST /auth/anonymous"
```

---

## Task 4: Backend — Límites para usuarios anónimos

**Files:**

- Create: `apps/api/src/modules/auth/guards/anonymous-limits.guard.ts`
- Create: `apps/api/src/modules/auth/guards/anonymous-limits.guard.spec.ts`
- Modify: `apps/api/src/modules/notes/notes.controller.ts:120-129` (agregar guard en create)
- Modify: `apps/api/src/modules/ai/application/services/ai-rate-limit.service.ts:32-55`

**Step 1: Escribir test del guard**

```typescript
describe('AnonymousLimitsGuard', () => {
  it('should allow authenticated users without limits', async () => {
    // user.isAnonymous === false → pass through
  });

  it('should block anonymous user creating 6th note', async () => {
    // user.isAnonymous === true, noteCount >= 5 → throw ForbiddenException
  });

  it('should allow anonymous user creating 5th note', async () => {
    // user.isAnonymous === true, noteCount < 5 → pass through
  });
});
```

**Step 2: Implementar guard**

```typescript
// anonymous-limits.guard.ts
@Injectable()
export class AnonymousNoteLimitGuard implements CanActivate {
  private static readonly MAX_ANONYMOUS_NOTES = 5;

  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser;

    if (!user?.isAnonymous) return true;

    const noteCount = await this.db.connection
      .select({ count: sql<number>`count(*)` })
      .from(notes)
      .where(eq(notes.ownerId, user.id));

    if (noteCount[0].count >= AnonymousNoteLimitGuard.MAX_ANONYMOUS_NOTES) {
      throw new ForbiddenException({
        code: 'ANONYMOUS_NOTE_LIMIT',
        message:
          'Anonymous users can create up to 5 notes. Sign up for unlimited notes.',
        limit: AnonymousNoteLimitGuard.MAX_ANONYMOUS_NOTES,
      });
    }

    return true;
  }
}
```

**Step 3: Aplicar guard al endpoint de creación de notas**

En `apps/api/src/modules/notes/notes.controller.ts`, línea ~120:

```typescript
@Post()
@UseGuards(AnonymousNoteLimitGuard) // Agregar este guard
@RequirePermission('create', SUBJECTS.Note)
async create(...) { }
```

**Step 4: Modificar AI rate limit para anónimos**

En `apps/api/src/modules/ai/application/services/ai-rate-limit.service.ts`, agregar lógica de límite diferenciado:

```typescript
private readonly ANONYMOUS_DAILY_REQUESTS = 3;

async checkLimit(userId: string, estimatedTokens: number, isAnonymous = false): Promise<RateLimitResult> {
  if (isAnonymous) {
    const requestCount = await this.usageRepository.getDailyRequestCount(userId);
    if (requestCount >= this.ANONYMOUS_DAILY_REQUESTS) {
      return {
        allowed: false,
        reason: 'Anonymous users are limited to 3 AI requests per day. Sign up for more.',
      };
    }
  }
  // ... resto de la lógica existente
}
```

**Step 5: Tests y commit**

```bash
pnpm nx test api -- --testPathPattern="anonymous-limits"
git add apps/api/src/modules/auth/guards/ apps/api/src/modules/notes/ apps/api/src/modules/ai/
git commit -m "feat(auth): add rate limits for anonymous users (5 notes, 3 AI/day)"
```

---

## Task 5: Backend — Migración de datos al registrarse

**Files:**

- Modify: `apps/api/src/modules/auth/auth-session.controller.ts` (endpoint register)
- Modify: `apps/api/src/modules/auth/application/services/anonymous-auth.service.ts`

**Step 1: Escribir test de migración**

```typescript
describe('register with anonymous migration', () => {
  it('should migrate notes from anonymous user to new registered user', async () => {
    // 1. Crear sesión anónima
    // 2. Crear nota como anónimo
    // 3. Registrarse enviando anonymousUserId
    // 4. Verificar nota ahora pertenece al nuevo usuario
    // 5. Verificar usuario anónimo eliminado
  });

  it('should register normally without anonymousUserId', async () => {
    // El flujo normal no se rompe
  });
});
```

**Step 2: Modificar endpoint de registro**

En el controller de register, aceptar un campo opcional `anonymousUserId` en el body:

```typescript
@Public()
@Post('register')
async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
  const result = await this.authService.register(dto);
  // ... existing logic ...

  // Migrar datos si viene de sesión anónima
  if (dto.anonymousUserId) {
    await this.anonymousAuthService.migrateAnonymousData(
      dto.anonymousUserId,
      result.user.id,
    );
  }

  return result;
}
```

**Step 3: Actualizar DTO de registro**

Agregar `anonymousUserId?: string` al DTO de registro con validación Zod opcional.

**Step 4: Tests y commit**

```bash
pnpm nx test api -- --testPathPattern="register|anonymous"
git add apps/api/src/modules/auth/
git commit -m "feat(auth): migrate anonymous data on registration"
```

---

## Task 6: Backend — Modificar permisos para anónimos autenticados

**Files:**

- Modify: `libs/authorization/src/lib/permissions.ts:14-40`
- Modify: `libs/authorization/src/lib/types.ts`

**Step 1: Escribir tests de permisos**

```typescript
describe('defineAbilityFor — anonymous authenticated user', () => {
  it('should allow anonymous user to manage their own notes', () => {
    const user = { id: 'anon-123', isAnonymous: true };
    const ability = defineAbilityFor(user);
    expect(
      ability.can('manage', { __typename: 'Note', ownerId: 'anon-123' })
    ).toBe(true);
  });

  it('should NOT allow anonymous user to share notes', () => {
    const user = { id: 'anon-123', isAnonymous: true };
    const ability = defineAbilityFor(user);
    expect(
      ability.can('share', { __typename: 'Note', ownerId: 'anon-123' })
    ).toBe(false);
  });
});
```

**Step 2: Actualizar tipos**

En `libs/authorization/src/lib/types.ts`, agregar `isAnonymous` a `AuthUser`:

```typescript
export interface AuthUser {
  id: string;
  isAnonymous?: boolean;
}
```

**Step 3: Actualizar permisos**

En `libs/authorization/src/lib/permissions.ts`:

```typescript
export function defineAbilityFor(
  user: AuthUser | null,
  context: PermissionContext = {}
): AppAbility {
  return definePermissions<AppAbility>(
    (allow) => {
      if (!user) {
        allow('read', Note, { generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK });
        return;
      }

      if (user.isAnonymous) {
        // Anónimos: CRUD de sus propias notas, pero NO compartir
        allow('create', Note);
        allow('read', Note, { ownerId: user.id });
        allow('update', Note, { ownerId: user.id });
        allow('delete', Note, { ownerId: user.id });
        allow('read', Note, { generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK });
        return;
      }

      // Usuarios registrados: acceso completo
      allow('manage', Note, { ownerId: user.id });
      allow('read', Note, { generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK });

      for (const shared of context.sharedNotes ?? []) {
        if (shared.permission === PERMISSION.EDITOR) {
          allow('read', Note, { id: shared.noteId });
          allow('update', Note, { id: shared.noteId });
        } else if (shared.permission === PERMISSION.VIEWER) {
          allow('read', Note, { id: shared.noteId });
        }
      }
    },
    { resolveSubject: (obj) => obj.__typename }
  );
}
```

**Step 4: Tests y commit**

```bash
pnpm nx test authorization
git add libs/authorization/
git commit -m "feat(auth): add anonymous user permissions (CRUD own notes, no sharing)"
```

---

## Task 7: Frontend — Anonymous session manager

**Files:**

- Create: `apps/notes/src/auth/anonymous-session.ts`
- Create: `apps/notes/src/auth/anonymous-session.spec.ts`
- Modify: `apps/notes/src/auth/setup.ts:1-37`

**Step 1: Escribir test**

```typescript
describe('AnonymousSessionManager', () => {
  it('should create anonymous session if no auth exists', async () => {
    // localStorage vacío, no hay token
    // Llama POST /auth/anonymous
    // Guarda accessToken y anonymousUserId en localStorage
  });

  it('should restore existing anonymous session from localStorage', () => {
    // localStorage tiene anonymousUserId + token
    // No llama al API, restaura desde localStorage
  });

  it('should not create anonymous session if user is already authenticated', () => {
    // authStore.isAuthenticated === true
    // No hace nada
  });
});
```

**Step 2: Implementar**

```typescript
// anonymous-session.ts
const ANON_STORAGE_KEY = 'knowtis-anon';

interface AnonymousSession {
  userId: string;
  accessToken: string;
  createdAt: string;
}

export async function initAnonymousSession(
  httpClient: HttpClient,
  tokenStorage: TokenStorage,
  authStore: AuthStore
): Promise<void> {
  // Si ya está autenticado (normal o anónimo), no hacer nada
  if (authStore.getState().isAuthenticated) return;

  // Intentar restaurar sesión anónima de localStorage
  const stored = localStorage.getItem(ANON_STORAGE_KEY);
  if (stored) {
    try {
      const session: AnonymousSession = JSON.parse(stored);
      tokenStorage.setAccessToken(session.accessToken);
      authStore.getState().setUser({
        id: session.userId,
        name: 'Anonymous',
        isAnonymous: true,
      });
      return;
    } catch {
      localStorage.removeItem(ANON_STORAGE_KEY);
    }
  }

  // Crear nueva sesión anónima
  const response = await httpClient.post(
    '/auth/anonymous',
    {},
    { skipAuth: true }
  );
  const { user, accessToken } = response;

  tokenStorage.setAccessToken(accessToken);
  authStore.getState().setUser({ ...user, isAnonymous: true });

  localStorage.setItem(
    ANON_STORAGE_KEY,
    JSON.stringify({
      userId: user.id,
      accessToken,
      createdAt: new Date().toISOString(),
    })
  );
}

export function getAnonymousUserId(): string | null {
  const stored = localStorage.getItem(ANON_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored).userId;
  } catch {
    return null;
  }
}

export function clearAnonymousSession(): void {
  localStorage.removeItem(ANON_STORAGE_KEY);
}
```

**Step 3: Integrar en setup.ts**

En `apps/notes/src/auth/setup.ts`, importar e inicializar:

```typescript
import { initAnonymousSession } from './anonymous-session';

// Al final del archivo, exportar función de inicialización
export async function initAuth(): Promise<void> {
  await initAnonymousSession(httpClient, tokenStorage, authStore);
}
```

**Step 4: Tests y commit**

```bash
pnpm nx test notes -- --testPathPattern=anonymous-session
git add apps/notes/src/auth/
git commit -m "feat(auth): add anonymous session manager for frontend"
```

---

## Task 8: Frontend — Eliminar gate de autenticación en rutas principales

**Files:**

- Modify: `apps/notes/src/routes/_authenticated.tsx:1-60`
- Modify: `apps/notes/src/routes/__root.tsx:20-23, 48-67`
- Create: `apps/notes/src/routes/_app.tsx` (nuevo layout route sin auth gate)

**Step 1: Crear nuevo layout `_app.tsx`**

Reemplazar el concepto de `_authenticated` con `_app` que funciona para todos:

```typescript
// _app.tsx — layout principal para authenticated Y anonymous
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { authStore } from '@/auth';
import { initAuth } from '@/auth/setup';

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    // Asegurar que hay alguna sesión (normal o anónima)
    await initAuth();
  },
  component: AppLayout,
});

function AppLayout() {
  const user = useAuthUser();
  const isAnonymous = user?.isAnonymous ?? false;

  return (
    <div className="flex min-h-screen bg-(--background)">
      <Sidebar isAnonymous={isAnonymous} />
      {!isAnonymous && <SettingsModal />}
      <BottomNav isAnonymous={isAnonymous} />

      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300 md:pl-56 pb-20 md:pb-0">
        <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

**Step 2: Mover rutas de `_authenticated/` a `_app/`**

- `_authenticated/index.tsx` → `_app/index.tsx`
- `_authenticated/notes/index.tsx` → `_app/notes/index.tsx`
- `_authenticated/notes/$noteId.tsx` → `_app/notes/$noteId.tsx`

**Step 3: Mantener `_authenticated.tsx` como redirect legacy**

```typescript
// _authenticated.tsx — redirect a _app para backwards compat temporal
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
});
```

**Step 4: Actualizar `__root.tsx`**

Modificar `handleAuthFailure` y `NotFoundRedirect` para que no asuman que sin auth = ir a login:

```typescript
function handleAuthFailure(): void {
  // Solo forzar logout si era un usuario registrado
  const { user } = authStore.getState();
  if (user && !user.isAnonymous) {
    authStore.getState().logout();
    window.location.href = '/login';
  }
}

function NotFoundRedirect() {
  return <Navigate to="/" />;
}
```

**Step 5: Tests y commit**

```bash
pnpm nx test notes
git add apps/notes/src/routes/
git commit -m "feat(routing): replace auth gate with open-access app layout"
```

---

## Task 9: Frontend — Upgrade banner y prompts de registro

**Files:**

- Create: `apps/notes/src/components/anonymous/UpgradeBanner.tsx`
- Create: `apps/notes/src/components/anonymous/AnonymousLimitModal.tsx`
- Create: `libs/shared/types/src/lib/anonymous.types.ts`

**Step 1: Definir tipos**

```typescript
// anonymous.types.ts
export interface AnonymousLimits {
  maxNotes: number;
  maxAiRequestsPerDay: number;
}

export const ANONYMOUS_LIMITS: AnonymousLimits = {
  maxNotes: 5,
  maxAiRequestsPerDay: 3,
};
```

**Step 2: Crear UpgradeBanner**

Banner sutil en la parte superior para usuarios anónimos. Diseño: fondo con gradiente sutil, texto conciso, CTA claro.

```tsx
// UpgradeBanner.tsx
export function UpgradeBanner() {
  const user = useAuthUser();
  const [dismissed, setDismissed] = useState(false);

  if (!user?.isAnonymous || dismissed) return null;

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-(--primary)/10 via-(--primary)/5 to-transparent border-b border-(--border) px-4 py-2.5">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <p className="text-sm text-(--muted-foreground)">
          <span className="font-medium text-(--foreground)">
            You're using Knowtis as a guest.
          </span>{' '}
          Sign up to unlock unlimited notes, collaboration, and multi-device
          sync.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            to="/register"
            className="text-sm font-medium text-(--primary) hover:underline"
          >
            Create account
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="text-(--muted-foreground) hover:text-(--foreground)"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Crear AnonymousLimitModal**

Modal que aparece cuando el anónimo alcanza un límite (5 notas o 3 AI requests):

```tsx
// AnonymousLimitModal.tsx
export function AnonymousLimitModal({
  type,
  onClose,
}: {
  type: 'notes' | 'ai';
  onClose: () => void;
}) {
  const messages = {
    notes: {
      title: "You've reached the guest note limit",
      description:
        'Create a free account to save unlimited notes and access them from any device.',
    },
    ai: {
      title: 'AI requests limit reached for today',
      description:
        'Sign up for a free account to get more AI completions daily.',
    },
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages[type].title}</DialogTitle>
          <DialogDescription>{messages[type].description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="outline" onClick={onClose}>
            Maybe later
          </Button>
          <Button asChild>
            <Link to="/register">Create free account</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 4: Integrar banner en `_app.tsx` layout**

```tsx
<UpgradeBanner />
<main>...</main>
```

**Step 5: Commit**

```bash
git add apps/notes/src/components/anonymous/ libs/shared/types/
git commit -m "feat(ui): add upgrade banner and limit modals for anonymous users"
```

---

## Task 10: Frontend — Modificar registro para migrar datos anónimos

**Files:**

- Modify: `apps/notes/src/routes/register.tsx`
- Modify: `apps/notes/src/auth/auth-api-adapter.ts`
- Modify: `apps/notes/src/auth/anonymous-session.ts`

**Step 1: Modificar auth adapter**

En `auth-api-adapter.ts`, el método `register` debe enviar `anonymousUserId` si existe:

```typescript
async register(input: RegisterInput) {
  const anonymousUserId = getAnonymousUserId();
  const response = await httpClient.post('/auth/register', {
    ...input,
    ...(anonymousUserId && { anonymousUserId }),
  }, { skipAuth: true });

  // Limpiar sesión anónima después de registro exitoso
  clearAnonymousSession();
  tokenStorage.setAccessToken(response.tokens.accessToken);
  // ... rest
}
```

**Step 2: Actualizar página de registro**

Agregar mensaje contextual si el usuario viene de una sesión anónima:

```tsx
// En register.tsx, dentro del formulario:
{
  getAnonymousUserId() && (
    <p className="text-sm text-(--muted-foreground) text-center">
      Your existing notes will be saved to your new account.
    </p>
  );
}
```

**Step 3: Tests y commit**

```bash
pnpm nx test notes -- --testPathPattern="register|anonymous"
git add apps/notes/src/
git commit -m "feat(auth): migrate anonymous notes on registration"
```

---

## Task 11: Backend — AI acceso para anónimos

**Files:**

- Modify: `apps/api/src/modules/ai/ai.controller.ts:55-57`
- Modify: `apps/api/src/modules/ai/application/commands/complete-text.handler.ts`

**Step 1: El AI controller ya funciona**

Como los anónimos tienen JWT válido, `JwtAuthGuard` ya los permite. Solo necesitamos asegurar que el rate limit diferenciado (Task 4) se aplique correctamente.

**Step 2: Pasar `isAnonymous` al handler**

En `ai.controller.ts`, línea ~66:

```typescript
@Post('complete')
async complete(@CurrentUser() user: RequestUser, @Body() dto: AICompleteDto) {
  const result = await this.completeTextHandler.execute({
    userId: user.id,
    isAnonymous: user.isAnonymous ?? false,
    // ... rest of dto fields
  });
  return unwrapOrThrow(result);
}
```

**Step 3: Propagar al rate limiter en el handler**

En `complete-text.handler.ts`, pasar `isAnonymous` a `checkLimit`:

```typescript
const rateLimitResult = await this.rateLimitService.checkLimit(
  input.userId,
  estimatedTokens,
  input.isAnonymous
);
```

**Step 4: Tests y commit**

```bash
pnpm nx test api -- --testPathPattern="ai|complete-text"
git add apps/api/src/modules/ai/
git commit -m "feat(ai): enable AI for anonymous users with reduced daily limits"
```

---

## Task 12: Limpieza — Cron job para usuarios anónimos abandonados

**Files:**

- Create: `apps/api/src/modules/auth/tasks/cleanup-anonymous.task.ts`
- Create: `apps/api/src/modules/auth/tasks/cleanup-anonymous.task.spec.ts`

**Step 1: Escribir test**

```typescript
describe('CleanupAnonymousTask', () => {
  it('should delete anonymous users older than 30 days', async () => {
    // Crear usuario anónimo con createdAt hace 31 días
    // Ejecutar task
    // Verificar que fue eliminado (cascade elimina notas + ai_usage)
  });

  it('should NOT delete anonymous users younger than 30 days', async () => {
    // Crear usuario anónimo con createdAt hace 5 días
    // Ejecutar task
    // Verificar que sigue existiendo
  });
});
```

**Step 2: Implementar cron**

```typescript
// cleanup-anonymous.task.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lt } from 'drizzle-orm';

@Injectable()
export class CleanupAnonymousTask {
  private readonly logger = new Logger(CleanupAnonymousTask.name);
  private static readonly MAX_AGE_DAYS = 30;

  constructor(private readonly db: DatabaseService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CleanupAnonymousTask.MAX_AGE_DAYS);

    const result = await this.db.connection
      .delete(users)
      .where(and(eq(users.isAnonymous, true), lt(users.createdAt, cutoff)))
      .returning({ id: users.id });

    if (result.length > 0) {
      this.logger.log(`Cleaned up ${result.length} abandoned anonymous users`);
    }
  }
}
```

**Step 3: Registrar en módulo** — agregar `ScheduleModule` si no existe, registrar el task.

**Step 4: Tests y commit**

```bash
pnpm nx test api -- --testPathPattern="cleanup-anonymous"
git add apps/api/src/modules/auth/tasks/
git commit -m "feat(auth): add cron job to clean up abandoned anonymous users (30d)"
```

---

## Task 13: Integración final y validación E2E

**Step 1: Verificar flujo completo manualmente**

1. Abrir app sin login → debe crear sesión anónima automáticamente
2. Crear una nota → se guarda en servidor
3. Usar AI (autocompletado) → funciona con límite de 3/día
4. Crear 5 notas → la 6ta muestra modal de upgrade
5. Registrarse → notas migran a la nueva cuenta
6. Verificar que las 5 notas aparecen en la cuenta registrada

**Step 2: Correr toda la suite de tests**

```bash
pnpm lint
pnpm typecheck
pnpm test:run
```

Expected: Todo verde.

**Step 3: Verificar que no hay regresiones en flujo auth normal**

1. Login con cuenta existente → funciona normal
2. Logout → no crea sesión anónima si el usuario se deslogueó intencionalmente
3. Shared notes → siguen funcionando como antes

**Step 4: Commit final**

```bash
git add .
git commit -m "test(e2e): validate open access flow end-to-end"
```

---

## Resumen de Cambios por Área

| Área                 | Archivos                                                                    | Cambios                                |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| **DB Schema**        | `users.schema.ts`                                                           | +`isAnonymous` boolean                 |
| **Backend Auth**     | `anonymous-auth.service.ts`, `auth-session.controller.ts`, `auth.module.ts` | Sesión anónima + migración             |
| **Backend Limits**   | `anonymous-limits.guard.ts`, `ai-rate-limit.service.ts`                     | 5 notas, 3 AI/día                      |
| **Backend Cleanup**  | `cleanup-anonymous.task.ts`                                                 | Cron 3AM, eliminar >30 días            |
| **Authorization**    | `permissions.ts`, `types.ts`                                                | Permisos anónimos (CRUD own, no share) |
| **Frontend Auth**    | `anonymous-session.ts`, `setup.ts`, `auth-api-adapter.ts`                   | Auto-sesión + migración al registro    |
| **Frontend Routing** | `_app.tsx` (nuevo), `_authenticated.tsx`, `__root.tsx`                      | Eliminar auth gate                     |
| **Frontend UI**      | `UpgradeBanner.tsx`, `AnonymousLimitModal.tsx`                              | Prompts de upgrade                     |

## Límites Anónimos vs Registrados

| Feature                | Anónimo                    | Registrado                 |
| ---------------------- | -------------------------- | -------------------------- |
| Crear notas            | 5 max                      | Ilimitado                  |
| AI completions         | 3/día                      | Límite normal (env config) |
| Compartir notas        | No                         | Sí                         |
| Colaboración real-time | No                         | Sí                         |
| Multi-dispositivo      | No (solo navegador actual) | Sí                         |
| Persistencia           | 30 días                    | Permanente                 |
| Settings/perfil        | No                         | Sí                         |
