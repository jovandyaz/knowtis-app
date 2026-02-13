import { useState } from 'react';

import { Check, Copy, Link2, Loader2, Share2, Trash2 } from 'lucide-react';

import {
  useCreateShareLink,
  useRevokeShareLink,
  useShareLinks,
  useUpdateNote,
} from '@knowtis/data-access-notes';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@knowtis/design-system';
import type { NoteShareLink } from '@knowtis/shared-types';

interface ShareDialogProps {
  noteId: string;
  noteTitle: string;
  isPublic: boolean;
}

export function ShareDialog({ noteId, noteTitle, isPublic }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const { data: shareLinks = [], isLoading: isLoadingLinks } =
    useShareLinks(noteId);
  const createShareLink = useCreateShareLink();
  const revokeShareLink = useRevokeShareLink();
  const updateNote = useUpdateNote();

  const handleTogglePublic = () => {
    updateNote.mutate({ id: noteId, input: { isPublic: !isPublic } });
  };

  const handleCreateLink = (permission: 'viewer' | 'editor') => {
    createShareLink.mutate({ noteId, input: { permission } });
  };

  const handleRevokeLink = (linkId: string) => {
    revokeShareLink.mutate({ noteId, linkId });
  };

  const handleCopyLink = async (link: NoteShareLink) => {
    const url = `${window.location.origin}/s/${link.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedLinkId(link.id);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share &quot;{noteTitle}&quot;</DialogTitle>
          <DialogDescription>
            Control who can access this note.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Public/Private Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-(--border) p-4">
            <div>
              <p className="text-sm font-medium">
                {isPublic ? 'Public' : 'Private'}
              </p>
              <p className="text-xs text-(--muted-foreground)">
                {isPublic
                  ? 'Anyone with the link can view'
                  : 'Only you and shared users can access'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTogglePublic}
              disabled={updateNote.isPending}
            >
              {updateNote.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPublic ? (
                'Make Private'
              ) : (
                'Make Public'
              )}
            </Button>
          </div>

          {/* Create Share Link */}
          <div>
            <p className="mb-3 text-sm font-medium">Share via link</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCreateLink('viewer')}
                disabled={createShareLink.isPending}
              >
                <Link2 className="h-4 w-4" />
                Viewer link
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => handleCreateLink('editor')}
                disabled={createShareLink.isPending}
              >
                <Link2 className="h-4 w-4" />
                Editor link
              </Button>
            </div>
          </div>

          {/* Active Share Links */}
          {isLoadingLinks ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-(--muted-foreground)" />
            </div>
          ) : shareLinks.length > 0 ? (
            <div>
              <p className="mb-3 text-sm font-medium">Active links</p>
              <div className="space-y-2">
                {shareLinks.map((link) => (
                  <ShareLinkItem
                    key={link.id}
                    link={link}
                    isCopied={copiedLinkId === link.id}
                    onCopy={() => handleCopyLink(link)}
                    onRevoke={() => handleRevokeLink(link.id)}
                    isRevoking={revokeShareLink.isPending}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ShareLinkItemProps {
  link: NoteShareLink;
  isCopied: boolean;
  onCopy: () => void;
  onRevoke: () => void;
  isRevoking: boolean;
}

function ShareLinkItem({
  link,
  isCopied,
  onCopy,
  onRevoke,
  isRevoking,
}: ShareLinkItemProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-(--border) p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-(--muted-foreground)" />
        <Badge variant={link.permission === 'editor' ? 'default' : 'secondary'}>
          {link.permission}
        </Badge>
        {link.expiresAt && (
          <span className="text-xs text-(--muted-foreground)">
            Expires {new Date(link.expiresAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onCopy}
        >
          {isCopied ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-(--muted-foreground) hover:text-(--destructive)"
          onClick={onRevoke}
          disabled={isRevoking}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
