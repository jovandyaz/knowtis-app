import type { Meta, StoryObj } from '@storybook/react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './Table';

const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Table>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>ada@knowtis.app</TableCell>
          <TableCell>admin</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>grace@knowtis.app</TableCell>
          <TableCell>user</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
