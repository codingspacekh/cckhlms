'use client';
import { useState, useTransition } from 'react';
import { deleteCourseAction } from '@/modules/academics/actions';

// BR-23: a course no class uses can be deleted; asks once first, and says why when a class still uses it.
export function DeleteCourse({ courseId, code }: { courseId: string; code: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {error && (
        <span className="small bad-text" role="alert">
          {error}
        </span>
      )}
      {confirm ? (
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteCourseAction(courseId); // goes to the courses list when it worked
              if (!r.ok) setError(r.error);
            })
          }
        >
          Yes, delete {code}
        </button>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>
          Delete course
        </button>
      )}
    </>
  );
}
