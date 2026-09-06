import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { DIALOG_SIDE } from '../constants/dialog';
import { Button } from './Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog';
import { Input } from './Input';

const meta: Meta<typeof Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Dialog>;

function DefaultDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open Dialog
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel="Close dialog">
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>
              This is a dialog description. It provides additional context about
              the dialog content.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p>Dialog content goes here.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const Default: Story = {
  render: () => <DefaultDialogExample />,
};

function WithFormExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Edit Profile</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel="Close dialog">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Make changes to your profile here. Click save when you&apos;re
              done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" defaultValue="John Doe" />
            </div>
            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input id="email" defaultValue="john@example.com" type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={() => setOpen(false)}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const WithForm: Story = {
  render: () => <WithFormExample />,
};

function ControlledDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete Item
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel="Close dialog">
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the
              item.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const Controlled: Story = {
  render: () => <ControlledDialogExample />,
};

function FullscreenDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open fullscreen
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side={DIALOG_SIDE.FULL} closeLabel="Close dialog">
          <div className="border-b border-(--border) px-4 py-3">
            <DialogTitle className="text-sm">Diagram</DialogTitle>
          </div>
          <div className="grid place-items-center bg-(--muted)/30 p-6">
            <p className="text-sm text-(--muted-foreground)">
              The second row takes the remaining height, so a canvas can own the
              viewport.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const Fullscreen: Story = {
  render: () => <FullscreenDialogExample />,
};
