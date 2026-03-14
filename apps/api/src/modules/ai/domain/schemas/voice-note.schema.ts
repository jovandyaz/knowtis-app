import { z } from 'zod';

export const voiceNoteOutputSchema = z.object({
  title: z
    .string()
    .max(50)
    .describe('Short descriptive title, 3-8 words, like a headline'),
  content: z
    .string()
    .describe(
      'HTML content adapted to the nature of the text: <p> for prose/narrative, <ul>/<li> for lists, <ol> for steps, checkboxes for tasks, <h2> only when multiple distinct topics exist'
    ),
});
