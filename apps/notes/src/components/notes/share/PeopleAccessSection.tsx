import { useId, useState, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import {
  PersonInputSchema,
  useRevokePerson,
  useUpsertPerson,
  type PersonInput,
} from '@knowtis/data-access-notes';
import {
  Badge,
  Button,
  FormField,
  Input,
  LoadingButton,
  SegmentedControl,
} from '@knowtis/design-system';
import type { NotePerson, PermissionLevel } from '@knowtis/shared-types';

import type { ShareActionLock } from '../../../hooks/useShareActionLock';
import { useVerifyEmailGate } from '../../../hooks/useVerifyEmailGate';
import { RemovePersonDialog } from './RemovePersonDialog';

interface PeopleAccessSectionProps {
  noteId: string;
  actorId: string | undefined;
  people: NotePerson[];
  disabled: boolean;
  linkIsOpen: boolean;
  actionLock: ShareActionLock;
}

export function PeopleAccessSection({
  noteId,
  actorId,
  people,
  disabled,
  linkIsOpen,
  actionLock,
}: PeopleAccessSectionProps) {
  const { t } = useTranslation('notes');
  const inputId = useId();
  const upsert = useUpsertPerson();
  const revoke = useRevokePerson();
  const gate = useVerifyEmailGate();
  const [addError, setAddError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<PersonInput>({
    resolver: zodResolver(PersonInputSchema),
    defaultValues: { email: '', permission: 'viewer' },
  });
  const options = [
    { value: 'viewer' as const, label: t('share.viewer') },
    { value: 'editor' as const, label: t('share.editor') },
  ];
  const selectedPerson = people.find((person) => person.user.id === removeId);
  const isDisabled = disabled || actionLock.pending;
  const emailInvalid = !!form.formState.errors.email;

  const reportSaved = () => {
    setSaved(true);
    toast.success(t('share.people.saved'));
  };
  const upsertError = (error: unknown) =>
    ApiClientError.isApiClientError(error) && error.status === 422
      ? t('share.people.notAddable')
      : t('share.people.saveError');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isDisabled) {
      return;
    }
    void actionLock.run(async () => {
      await form.handleSubmit(async (input) => {
        setAddError(null);
        setSaved(false);
        try {
          await upsert.mutateAsync({ noteId, input });
          form.reset();
          reportSaved();
        } catch (error) {
          setAddError(
            gate.handleError(error)
              ? t('share.people.verifyRequired')
              : upsertError(error)
          );
        }
      })(event);
    });
  };

  const changePermission = (
    person: NotePerson,
    permission: PermissionLevel
  ) => {
    if (
      isDisabled ||
      person.permission === permission ||
      person.permission === 'owner' ||
      person.user.id === actorId
    ) {
      return;
    }
    void actionLock.run(async () => {
      setRowError(null);
      setSaved(false);
      try {
        await upsert.mutateAsync({
          noteId,
          input: { email: person.user.email, permission },
        });
        reportSaved();
      } catch (error) {
        setRowError(
          gate.handleError(error)
            ? t('share.people.verifyRequired')
            : upsertError(error)
        );
      }
    });
  };

  const removePerson = () => {
    if (
      isDisabled ||
      !selectedPerson ||
      selectedPerson.permission === 'owner' ||
      selectedPerson.user.id === actorId
    ) {
      return;
    }
    void actionLock.run(async () => {
      setRemoveError(null);
      setSaved(false);
      try {
        await revoke.mutateAsync({ noteId, userId: selectedPerson.user.id });
        setRemoveId(null);
        reportSaved();
      } catch {
        setRemoveError(t('share.people.removeError'));
      }
    });
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label={t('share.people.title')}
    >
      <h3 className="text-sm font-medium">{t('share.people.title')}</h3>
      <form
        aria-label={t('share.people.add')}
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-3"
      >
        <FormField
          id={inputId}
          label={t('share.people.email')}
          error={emailInvalid ? t('share.people.invalidEmail') : undefined}
        >
          <Input
            {...form.register('email')}
            id={inputId}
            type="email"
            autoComplete="email"
            disabled={isDisabled}
            aria-invalid={emailInvalid}
            aria-describedby={`${inputId}-help${emailInvalid ? ` ${inputId}-error` : ''}`}
          />
        </FormField>
        <p id={`${inputId}-help`} className="text-xs text-(--muted-foreground)">
          {t('share.people.emailHelp')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Controller
            control={form.control}
            name="permission"
            render={({ field }) => (
              <SegmentedControl
                aria-label={t('share.people.newPermission')}
                options={options}
                value={field.value}
                onValueChange={field.onChange}
                disabled={isDisabled}
              />
            )}
          />
          <LoadingButton
            type="submit"
            disabled={isDisabled}
            loading={form.formState.isSubmitting}
            loadingText={t('share.people.adding')}
          >
            {t('share.people.add')}
          </LoadingButton>
        </div>
        {addError ? (
          <p role="alert" className="text-sm text-(--destructive)">
            {addError}
          </p>
        ) : null}
      </form>
      {saved ? (
        <p role="status" className="text-sm text-(--muted-foreground)">
          {t('share.people.saved')}
        </p>
      ) : null}
      {rowError ? (
        <p role="alert" className="text-sm text-(--destructive)">
          {rowError}
        </p>
      ) : null}
      <ul
        aria-label={t('share.people.title')}
        className="flex min-w-0 flex-col gap-4"
      >
        {people.map((person) => {
          const immutable =
            person.permission === 'owner' || person.user.id === actorId;
          return (
            <li
              key={person.user.id}
              aria-label={person.user.email}
              className="flex min-w-0 flex-col gap-2"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">
                    {person.user.name}
                  </p>
                  <p className="break-all text-xs text-(--muted-foreground)">
                    {person.user.email}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {person.user.id === actorId ? (
                    <Badge variant="secondary">{t('share.people.you')}</Badge>
                  ) : null}
                  {immutable ? (
                    <Badge variant="outline">
                      {t(`share.${person.permission}`)}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {!immutable ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SegmentedControl
                    aria-label={t('share.people.permissionFor', {
                      email: person.user.email,
                    })}
                    options={options}
                    value={person.permission === 'editor' ? 'editor' : 'viewer'}
                    disabled={isDisabled}
                    onValueChange={(permission) =>
                      changePermission(person, permission)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDisabled}
                    aria-label={t('share.people.removePerson', {
                      name: person.user.name,
                    })}
                    onClick={() => {
                      if (!isDisabled) {
                        setRemoveError(null);
                        setRemoveId(person.user.id);
                      }
                    }}
                  >
                    {t('share.people.remove')}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <RemovePersonDialog
        person={selectedPerson}
        linkIsOpen={linkIsOpen}
        disabled={isDisabled}
        pending={revoke.isPending}
        error={removeError}
        onCancel={() => setRemoveId(null)}
        onConfirm={removePerson}
      />
    </section>
  );
}
