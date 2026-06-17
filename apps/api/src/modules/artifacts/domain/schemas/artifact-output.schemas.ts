import { z } from 'zod';

export const flashcardDeckOutputSchema = z.object({
  cards: z.array(
    z.object({
      front: z
        .string()
        .describe('The question or prompt side of the flashcard'),
      back: z.string().describe('The answer or explanation side'),
      difficulty: z
        .enum(['easy', 'medium', 'hard'])
        .describe('Estimated difficulty for a learner'),
    })
  ),
});

export const quizOutputSchema = z.object({
  questions: z.array(
    z
      .object({
        question: z.string().describe('The quiz question'),
        options: z
          .array(z.string())
          .min(3)
          .max(5)
          .describe('Answer options (3-5 choices)'),
        correctIndex: z
          .number()
          .int()
          .min(0)
          .describe('Zero-based index of the correct option'),
        explanation: z
          .string()
          .describe('Brief explanation of why the answer is correct'),
      })
      .refine((q) => q.correctIndex < q.options.length, {
        message: 'correctIndex must be within options range',
        path: ['correctIndex'],
      })
  ),
});

export const summaryOutputSchema = z.object({
  summary: z
    .string()
    .describe('A concise HTML-formatted summary of the content'),
  keyPoints: z
    .array(z.string())
    .describe('3-7 key takeaways as short bullet points'),
});

interface MindMapNodeInput {
  label: string;
  children: MindMapNodeInput[] | null;
}

const mindMapNodeSchema: z.ZodType<MindMapNodeInput> = z.object({
  label: z.string().describe('Node label text'),
  children: z
    .lazy(() => z.array(mindMapNodeSchema))
    .nullable()
    .describe('Child nodes; null for leaf nodes'),
});

export const mindMapOutputSchema = z.object({
  root: z.string().describe('Central topic of the mind map'),
  children: z
    .array(mindMapNodeSchema)
    .describe('First-level branches from the root'),
});

export const learnTopicOutputSchema = z.object({
  title: z.string().max(50).describe('Concise title for the note, 3-8 words'),
  content: z
    .string()
    .describe(
      'Educational HTML content with h2 sections, p explanations, ul key points, and code for examples when relevant'
    ),
});
