import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { ModelMenu, type ModelMenuProps } from './ModelMenu';

const PRIMARY = [
  {
    id: 'fast',
    label: 'Rápido',
    description: 'Haiku 4.5 · Respuestas al instante',
  },
  {
    id: 'balanced',
    label: 'Balanceado',
    description: 'Sonnet 5 · El equilibrio ideal',
  },
  {
    id: 'powerful',
    label: 'Profundo',
    description: 'Opus 5 · Razonamiento a fondo',
  },
];

const EFFORT_OPTIONS = [
  { id: 'auto', label: 'Auto', description: 'El modelo decide' },
  { id: 'low', label: 'Bajo', description: 'Respuestas rápidas' },
  { id: 'medium', label: 'Medio' },
  { id: 'high', label: 'Alto', description: 'Razonamiento extendido' },
];

const MORE_MODELS = {
  label: 'Avanzado',
  groups: [
    {
      label: 'Anthropic',
      options: [
        {
          id: 'anthropic:claude-opus-5',
          label: 'Opus 5',
          description: 'El más capaz para razonamiento complejo',
          cost: '$$$',
          billedBadge: 'Tu clave',
        },
      ],
    },
    {
      label: 'OpenRouter',
      options: [
        {
          id: 'openrouter:deepseek/deepseek-v4-flash-0731',
          label: 'DeepSeek V4 Flash 0731',
          description: 'Insignia open-weight a una fracción del costo',
          cost: '$',
          billedBadge: 'Tu clave',
        },
      ],
    },
  ],
};

const meta: Meta<typeof ModelMenu> = {
  title: 'Components/ModelMenu',
  component: ModelMenu,
};
export default meta;

type Story = StoryObj<typeof ModelMenu>;

function labelFor(
  id: string | null,
  primary: ModelMenuProps['primary'],
  moreModels?: ModelMenuProps['moreModels']
): string {
  const row =
    primary.find((r) => r.id === id) ??
    moreModels?.groups.flatMap((g) => g.options).find((o) => o.id === id);
  return row?.label ?? '—';
}

function Controlled(
  props: Omit<ModelMenuProps, 'value' | 'onSelect' | 'triggerLabel'> & {
    initial: string | null;
  }
) {
  const { initial, ...rest } = props;
  const [value, setValue] = useState<string | null>(initial);
  return (
    <ModelMenu
      {...rest}
      value={value}
      onSelect={setValue}
      triggerLabel={labelFor(value, rest.primary, rest.moreModels)}
    />
  );
}

function ControlledWithEffort({
  inlineSections = false,
}: {
  inlineSections?: boolean;
}) {
  const [value, setValue] = useState<string | null>('balanced');
  const [effortValue, setEffortValue] = useState('auto');
  const effortLabel = EFFORT_OPTIONS.find((o) => o.id === effortValue)?.label;
  return (
    <ModelMenu
      primary={PRIMARY}
      value={value}
      onSelect={setValue}
      effort={{
        label: 'Esfuerzo',
        value: effortValue,
        options: EFFORT_OPTIONS,
        footnote: 'Un esfuerzo mayor consume más créditos',
        onChange: setEffortValue,
      }}
      moreModels={MORE_MODELS}
      triggerLabel={labelFor(value, PRIMARY, MORE_MODELS)}
      {...(effortValue !== 'auto' && effortLabel
        ? { triggerDetail: effortLabel }
        : {})}
      aria-label="Modelo"
      inlineSections={inlineSections}
    />
  );
}

export const FreeRegistered: Story = {
  render: () => (
    <Controlled
      initial="balanced"
      primary={PRIMARY}
      footerCta={{
        label: 'Más modelos con tu API key →',
        onClick: () => undefined,
      }}
      aria-label="Modelo"
    />
  ),
};

export const Byok: Story = {
  render: () => <ControlledWithEffort />,
};

export const MobileInline: Story = {
  name: 'Byok (mobile, inline sections)',
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => <ControlledWithEffort inlineSections />,
};

export const Loading: Story = {
  render: () => (
    <ModelMenu
      primary={[]}
      value={null}
      onSelect={() => undefined}
      status="loading"
      triggerLabel="Balanceado"
      loadingLabel="Cargando modelos…"
      aria-label="Modelo"
    />
  ),
};
