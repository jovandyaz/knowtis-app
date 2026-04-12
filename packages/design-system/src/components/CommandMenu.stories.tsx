import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import {
  FileText,
  Languages,
  List,
  MessageSquare,
  Pencil,
  PenLine,
  Sparkles,
  Type,
} from 'lucide-react';

import {
  CommandMenuBack,
  CommandMenuContent,
  CommandMenuGroup,
  CommandMenuItem,
} from './CommandMenu';

const meta: Meta<typeof CommandMenuContent> = {
  title: 'Components/CommandMenu',
  component: CommandMenuContent,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
};

export default meta;
type Story = StoryObj<typeof CommandMenuContent>;

export const Default: Story = {
  render: () => (
    <CommandMenuContent width="lg">
      <CommandMenuGroup label="IA">
        <CommandMenuItem
          icon={<FileText className="h-4 w-4 text-primary/70" />}
          label="Resumir"
          description="Crear un resumen de la nota"
        />
        <CommandMenuItem
          icon={<List className="h-4 w-4 text-primary/70" />}
          label="Crear esquema"
          description="Generar un esquema estructurado"
        />
        <CommandMenuItem
          icon={<MessageSquare className="h-4 w-4 text-primary/70" />}
          label="Preguntar a IA"
          description="Hacer una pregunta sobre la nota"
        />
        <CommandMenuItem
          icon={<PenLine className="h-4 w-4 text-primary/70" />}
          label="Continuar escribiendo"
          description="Dejar que la IA continue desde el cursor"
        />
      </CommandMenuGroup>
      <CommandMenuGroup label="Formato" showSeparator>
        <CommandMenuItem
          icon={<Type className="h-4 w-4 text-muted-foreground" />}
          label="Encabezado 1"
          description="Encabezado de sección grande"
        />
      </CommandMenuGroup>
    </CommandMenuContent>
  ),
};

export const WithSelection: Story = {
  render: () => (
    <CommandMenuContent width="lg">
      <CommandMenuGroup label="IA">
        <CommandMenuItem
          icon={<FileText className="h-4 w-4 text-primary/70" />}
          label="Resumir"
          description="Crear un resumen de la nota"
        />
        <CommandMenuItem
          icon={<List className="h-4 w-4 text-primary/70" />}
          label="Crear esquema"
          description="Generar un esquema estructurado"
          selected
        />
      </CommandMenuGroup>
    </CommandMenuContent>
  ),
};

export const ActionsMenu: Story = {
  name: 'Actions (Bubble Menu style)',
  render: () => (
    <CommandMenuContent width="md">
      <CommandMenuGroup>
        <CommandMenuItem
          icon={<Pencil className="h-4 w-4 text-primary/70" />}
          label="Mejorar redacción"
        />
        <CommandMenuItem
          icon={<Sparkles className="h-4 w-4 text-primary/70" />}
          label="Corregir ortografía y gramática"
        />
        <CommandMenuItem
          icon={<Languages className="h-4 w-4 text-primary/70" />}
          label="Traducir"
          hasSubMenu
        />
      </CommandMenuGroup>
    </CommandMenuContent>
  ),
};

export const SubMenuView: Story = {
  name: 'Sub-menu with Back',
  render: () => (
    <CommandMenuContent width="sm">
      <CommandMenuGroup>
        <CommandMenuBack label="Volver" onClick={() => {}} />
        <CommandMenuItem label="Inglés" />
        <CommandMenuItem label="Español" />
        <CommandMenuItem label="Francés" />
        <CommandMenuItem label="Alemán" />
      </CommandMenuGroup>
    </CommandMenuContent>
  ),
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [selected, setSelected] = useState(0);
    const items = [
      { label: 'Resumir', desc: 'Crear un resumen' },
      { label: 'Crear esquema', desc: 'Generar un esquema' },
      { label: 'Preguntar a IA', desc: 'Hacer una pregunta' },
    ];

    return (
      <CommandMenuContent width="lg">
        <CommandMenuGroup label="IA">
          {items.map((item, i) => (
            <CommandMenuItem
              key={item.label}
              icon={<Sparkles className="h-4 w-4 text-primary/70" />}
              label={item.label}
              description={item.desc}
              selected={i === selected}
              onClick={() => setSelected(i)}
              onMouseEnter={() => setSelected(i)}
            />
          ))}
        </CommandMenuGroup>
      </CommandMenuContent>
    );
  },
};
