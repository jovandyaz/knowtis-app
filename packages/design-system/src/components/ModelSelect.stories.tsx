import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import {
  ModelSelect,
  type ModelSelectOption,
  type ModelSelectProps,
} from './ModelSelect';

const MODELS: ModelSelectOption[] = [
  {
    id: 'anthropic:haiku-4.5',
    label: 'Haiku 4.5',
    tier: 'fast',
    description: 'Respuestas instantáneas',
    costClass: 1,
  },
  {
    id: 'anthropic:sonnet-5',
    label: 'Sonnet 5',
    tier: 'balanced',
    description: 'Balance entre calidad y velocidad',
    costClass: 2,
  },
  {
    id: 'anthropic:opus-5',
    label: 'Opus 5',
    tier: 'powerful',
    description: 'El más capaz para razonamiento complejo',
    costClass: 3,
  },
  {
    id: 'openai:gpt-6',
    label: 'GPT-6',
    tier: 'powerful',
    description: 'Frontera en tu clave',
    costClass: 3,
    billedToUser: true,
  },
];

const TIER_ORDER = ['fast', 'balanced', 'powerful'];

const STYLE_SECTION = {
  label: 'Estilo',
  options: [
    { id: 'fast', label: 'Rápido', description: 'Respuestas instantáneas' },
    { id: 'balanced', label: 'Equilibrado', description: 'El punto medio' },
    { id: 'powerful', label: 'Profundo', description: 'Razonamiento extenso' },
  ],
};

const meta: Meta<typeof ModelSelect> = {
  title: 'Components/ModelSelect',
  component: ModelSelect,
};
export default meta;

type Story = StoryObj<typeof ModelSelect>;

function Controlled(
  props: Omit<ModelSelectProps, 'value' | 'onSelect'> & {
    initial: string | null;
  }
) {
  const { initial, ...rest } = props;
  const [value, setValue] = useState<string | null>(initial);
  return <ModelSelect {...rest} value={value} onSelect={setValue} />;
}

export const Default: Story = {
  render: () => (
    <Controlled
      initial="anthropic:sonnet-5"
      models={MODELS}
      tierOrder={TIER_ORDER}
      billedBadgeLabel="Tu clave"
      aria-label="Modelo"
    />
  ),
};

export const LeadingSectionWithTiers: Story = {
  name: 'Leading section + tiers',
  render: () => (
    <Controlled
      initial="balanced"
      models={MODELS}
      tierOrder={TIER_ORDER}
      leadingSection={STYLE_SECTION}
      billedBadgeLabel="Tu clave"
      aria-label="Estilo del asistente"
    />
  ),
};

export const ErrorWithCachedModels: Story = {
  name: 'Error (cached models stay listed)',
  render: () => (
    <Controlled
      initial="anthropic:sonnet-5"
      models={MODELS}
      tierOrder={TIER_ORDER}
      leadingSection={STYLE_SECTION}
      status="error"
      errorLabel="No se pudieron actualizar los modelos"
      retryLabel="Reintentar"
      onRetry={() => undefined}
      billedBadgeLabel="Tu clave"
      aria-label="Estilo del asistente"
    />
  ),
};

export const ErrorWithEmptyList: Story = {
  name: 'Error (nothing cached)',
  render: () => (
    <ModelSelect
      models={[]}
      value={null}
      onSelect={() => undefined}
      status="error"
      errorLabel="No se pudieron cargar los modelos"
      retryLabel="Reintentar"
      onRetry={() => undefined}
      aria-label="Modelo"
    />
  ),
};

export const RowsAreActions: Story = {
  name: 'Action rows (rowsAreActions)',
  render: () => (
    <ModelSelect
      models={MODELS}
      value={null}
      onSelect={() => undefined}
      tierOrder={TIER_ORDER}
      rowsAreActions
      triggerVariant="outline"
      triggerLabel="Añadir modelo"
      aria-label="Añadir modelo"
    />
  ),
};
