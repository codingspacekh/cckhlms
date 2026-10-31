'use client';
import { useRef, useState } from 'react';
import type { LanguageChoice } from '@/modules/academics/languages';
import { CourseForm } from './CourseForm';

// "Add a course" opens the form in a dialog, so the courses table keeps the full width.
export function AddCourse({ languages }: { languages: LanguageChoice[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0); // a fresh form each time
  const [added, setAdded] = useState<string | null>(null);
  return (
    <>
      {added && (
        <span className="small muted" role="status">
          {added}
        </span>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          setFormKey((k) => k + 1);
          setAdded(null);
          dialog.current?.showModal();
        }}
      >
        Add a course
      </button>
      <dialog ref={dialog} className="dialog wide" aria-labelledby="course-form-title">
        {formKey > 0 && (
          <CourseForm
            key={formKey}
            languages={languages}
            onCancel={() => dialog.current?.close()}
            onSaved={(message) => {
              setAdded(message);
              dialog.current?.close();
            }}
          />
        )}
      </dialog>
    </>
  );
}
