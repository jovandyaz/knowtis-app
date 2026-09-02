import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { ModelMenu, type ModelMenuProps } from './ModelMenu';

const PRIMARY = [
  { id: 'fast', label: 'Haiku 4.5', description: 'Respuestas instantáneas' },
  {
    id: 'balanced',
    label: 'Sonnet 5',
    description: 'Balance entre calidad y velocidad',
  },
  { id: 'powerful', label: 'Opus 5', description: 'Razonamiento profundo' },
];

const EFFORT_OPTIONS = [
  { id: 'auto', label: 'Auto', description: 'El modelo decide' },
  { id: 'low', label: 'Bajo', description: 'Respuestas rápidas' },
  { id: 'medium', label: 'Medio' },
  { id: 'high', label: 'Alto', description: 'Razonamiento extendido' },
];

const MORE_MODELS = {
  label: 'Más modelos',
  groups: [
    {
      label: 'Anthropic',
      options: [
        {
          id: 'claude-x',
          label: 'Claude X',
          description: 'Modelo de frontera',
          cost: '$$$',
        },
      ],
    },
    {
      label: 'OpenAI',
      options: [
        {
          id: 'gpt-6',
          label: 'GPT-6',
          description: 'Facturado a tu clave',
          cost: '$$',
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

function Controlled(
  props: Omit<ModelMenuProps, 'value' | 'onSelect'> & { initial: string | null }
) {
  const { initial, ...rest } = props;
  const [value, setValue] = useState<string | null>(initial);
  return <ModelMenu {...rest} value={value} onSelect={setValue} />;
}

function ControlledWithEffort() {
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
      triggerLabel="Sonnet 5"
      {...(effortValue !== 'auto' && effortLabel
        ? { triggerDetail: effortLabel }
        : {})}
      aria-label="Modelo"
    />
  );
}

export const Anonymous: Story = {
  render: () => (
    <ModelMenu
      primary={PRIMARY.map((row) => ({ ...row, locked: true }))}
      value={null}
      onSelect={() => undefined}
      effort={{
        label: 'Esfuerzo',
        value: 'auto',
        options: EFFORT_OPTIONS,
        locked: true,
        onChange: () => undefined,
      }}
      footerCta={{
        label: 'Crea una cuenta gratis para elegir modelo',
        onClick: () => undefined,
      }}
      triggerLabel="Sonnet 5"
      aria-label="Modelo"
    />
  ),
};

export const FreeRegistered: Story = {
  render: () => (
    <Controlled
      initial="balanced"
      primary={PRIMARY}
      moreModels={{
        label: 'Más modelos',
        groups: [MORE_MODELS.groups[0]],
      }}
      triggerLabel="Sonnet 5"
      aria-label="Modelo"
    />
  ),
};

export const Byok: Story = {
  render: () => <ControlledWithEffort />,
};

export const Loading: Story = {
  render: () => (
    <ModelMenu
      primary={[]}
      value={null}
      onSelect={() => undefined}
      status="loading"
      triggerLabel="Sonnet 5"
      loadingLabel="Cargando modelos…"
      aria-label="Modelo"
    />
  ),
};
