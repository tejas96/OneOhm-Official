'use client';

import { Checkbox, Field } from '@oneohm/design-system/web';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useFolderLabel } from '@/features/documents/gallery/use-labels';

/** The folders whose files count as a required paper; any one of them satisfies it. */
export function RequirementFoldersPick({
  value,
  onChange,
}: {
  readonly value: readonly DocumentCategory[];
  readonly onChange: (categories: DocumentCategory[]) => void;
}) {
  const t = useTranslations('settings.requirements.dialog');
  const folderLabel = useFolderLabel();
  const toggle = (folder: DocumentCategory, on: boolean) =>
    onChange(on ? [...value, folder] : value.filter((item) => item !== folder));
  return (
    <Field label={t('folder')} hint={t('folderHint')} required>
      <div className="grid gap-x-5 sm:grid-cols-2">
        {DOCUMENT_CATEGORIES.map((folder) => (
          <Checkbox
            key={folder}
            checked={value.includes(folder)}
            label={folderLabel(folder)}
            onCheckedChange={(on) => toggle(folder, on)}
          />
        ))}
      </div>
    </Field>
  );
}
