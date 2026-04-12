import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from '@nestjs/common';
import matter from 'gray-matter';

export const PROMPTS_DIR = Symbol('PROMPTS_DIR');

export interface ParsedPrompt {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly cache: boolean;
  readonly content: string;
}

@Injectable()
export class PromptLoaderService implements OnModuleInit {
  private readonly logger = new Logger(PromptLoaderService.name);
  private readonly prompts = new Map<string, ParsedPrompt>();
  private readonly promptsDir: string;

  constructor(@Optional() @Inject(PROMPTS_DIR) promptsDir?: string) {
    if (!promptsDir) {
      throw new Error(
        'PROMPTS_DIR must be provided via DI (ai.module.ts) or constructor argument'
      );
    }
    this.promptsDir = promptsDir;
  }

  onModuleInit(): void {
    const partials = this.loadPartials();
    this.loadPrompts(partials);
    this.logger.log(`Loaded ${this.prompts.size} prompts`);
  }

  getPrompt(action: string): ParsedPrompt {
    const prompt = this.prompts.get(action);
    if (!prompt) {
      throw new Error(`Prompt not found: ${action}`);
    }
    return prompt;
  }

  private loadPartials(): Record<string, string> {
    const partialsDir = join(this.promptsDir, '_partials');
    const partials: Record<string, string> = {};

    try {
      const files = readdirSync(partialsDir);
      for (const file of files) {
        if (!file.endsWith('.md')) {
          continue;
        }
        const name = file.replace('.md', '').toUpperCase().replace(/-/g, '_');
        partials[name] = readFileSync(join(partialsDir, file), 'utf-8').trim();
      }
    } catch {
      this.logger.warn('No _partials directory found');
    }

    return partials;
  }

  private loadPrompts(partials: Record<string, string>): void {
    const categories = readdirSync(this.promptsDir, {
      withFileTypes: true,
    }).filter((d) => d.isDirectory() && !d.name.startsWith('_'));

    for (const category of categories) {
      const categoryDir = join(this.promptsDir, category.name);
      const files = readdirSync(categoryDir).filter((f) => f.endsWith('.md'));

      for (const file of files) {
        const raw = readFileSync(join(categoryDir, file), 'utf-8');
        const { data, content } = matter(raw);

        if (!data.id || typeof data.id !== 'string') {
          this.logger.warn(`Skipping prompt file with missing id: ${file}`);
          continue;
        }

        const resolvedContent = renderTemplate(content.trim(), partials);

        this.prompts.set(data.id, {
          id: data.id,
          category: data.category ?? category.name,
          description: data.description ?? '',
          cache: data.cache ?? false,
          content: resolvedContent,
        });
      }
    }
  }
}

function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
}
