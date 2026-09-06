import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useVerifyEmailGate } from '@/hooks/useVerifyEmailGate';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';

import {
  createMcpKeySchema,
  MCP_KEY_SCOPE_OPTIONS,
  useCreateMcpKey,
  type CreateMcpKeyFormValues,
} from '@knowtis/data-access-mcp-keys';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  LoadingButton,
  RadioCardGroup,
} from '@knowtis/design-system';

interface ScopeOptionCopy {
  labelKey: string;
  descriptionKey: string;
}

const SCOPE_OPTION_COPY = {
  'notes:read': {
    labelKey: 'integrations.scopeOptions.read.label',
    descriptionKey: 'integrations.scopeOptions.read.description',
  },
  'notes:read,notes:write': {
    labelKey: 'integrations.scopeOptions.readWrite.label',
    descriptionKey: 'integrations.scopeOptions.readWrite.description',
  },
  'notes:read,notes:write,notes:share': {
    labelKey: 'integrations.scopeOptions.readWriteShare.label',
    descriptionKey: 'integrations.scopeOptions.readWriteShare.description',
  },
} as const satisfies Record<
  (typeof MCP_KEY_SCOPE_OPTIONS)[number],
  ScopeOptionCopy
>;

const SCOPE_OPTIONS = MCP_KEY_SCOPE_OPTIONS.map((value) => ({
  value,
  ...SCOPE_OPTION_COPY[value],
}));

interface CreateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateKeyDialog({ open, onOpenChange }: CreateKeyDialogProps) {
  const { t } = useTranslation('common');
  const createKey = useCreateMcpKey();
  const verifyEmailGate = useVerifyEmailGate();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateMcpKeyFormValues>({
    resolver: zodResolver(createMcpKeySchema),
    defaultValues: { name: '', scopes: 'notes:read,notes:write' },
  });

  const selectedScopes = watch('scopes');

  const handleClose = () => {
    onOpenChange(false);
    // Reset after animation
    setTimeout(() => {
      setRevealedKey(null);
      reset();
    }, 200);
  };

  const onSubmit = (data: CreateMcpKeyFormValues) => {
    createKey.mutate(data, {
      onSuccess: (response) => {
        setRevealedKey(response.key);
        toast.success(t('integrations.keyCreated'));
      },
      onError: (error: Error) => {
        if (!verifyEmailGate.handleError(error)) {
          toast.error(error.message);
        }
      },
    });
  };

  const handleCopy = async () => {
    if (!revealedKey) {
      return;
    }
    await navigator.clipboard.writeText(revealedKey);
    toast.success(t('integrations.keyCopied'));
  };

  if (revealedKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent closeLabel={t('labels.closeDialog')}>
          <DialogHeader>
            <DialogTitle>{t('integrations.keyCreated')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={revealedKey}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                aria-label={t('integrations.copyKey')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-(--destructive) font-medium">
              {t('integrations.keyCreatedWarning')}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" onClick={handleClose}>
              {t('integrations.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent closeLabel={t('labels.closeDialog')}>
        <DialogHeader>
          <DialogTitle>{t('integrations.createKey')}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <FormField
            id="mcp-key-name"
            label={t('integrations.keyName')}
            error={errors.name?.message}
          >
            <Input
              id="mcp-key-name"
              type="text"
              placeholder={t('integrations.keyNamePlaceholder')}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'mcp-key-name-error' : undefined}
              {...register('name')}
            />
          </FormField>

          <div className="space-y-2">
            <span className="text-sm font-medium text-(--foreground)">
              {t('integrations.scopes')}
            </span>
            <RadioCardGroup
              aria-label={t('integrations.scopes')}
              options={SCOPE_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.labelKey),
                description: t(option.descriptionKey),
              }))}
              value={selectedScopes}
              onValueChange={(value) => setValue('scopes', value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('integrations.done')}
            </Button>
            <LoadingButton
              type="submit"
              loading={createKey.isPending}
              loadingText={t('integrations.createKey')}
            >
              <Plus className="h-4 w-4" />
              {t('integrations.createKey')}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
