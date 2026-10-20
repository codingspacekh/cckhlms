// FR-TCH-18: a class's statistics. Headline tiles, then attendance and the score trend by week, the average by
// task, how current standings spread, and the syllabus topics whose work scored lowest.
import { BarListCard, ColumnCard, LineCard, Meter } from '@/components/charts';
import { Tile } from '@/components/ui/Tile';
import { formatDate } from '@/modules/academics/schedule';
import { KIND_LABEL } from '@/modules/assessments/rules';
import type { ClassStatistics } from '@/modules/reporting/statistics';

export function ClassStatisticsView({ stats }: { stats: ClassStatistics }) {
  const { tiles, passMark } = stats;
  const pass = `Pass mark ${passMark}`;
  return (
    <>
      <div className="grid g3">
        <Tile
          label="Class average"
          value={
            <>
              {tiles.average === null ? '—' : tiles.average.toFixed(1)}
              <small> / 100</small>
            </>
          }
          note="Current standing: 60% exams + 30% classwork + 10% homework"
        >
          <Meter value={tiles.average} passMark={passMark} />
        </Tile>
        <Tile
          label="Below the pass mark"
          value={
            <>
              {tiles.belowPass}
              <small> of {tiles.withScore} students</small>
            </>
          }
          note={tiles.withScore < tiles.students ? `${tiles.students - tiles.withScore} with nothing marked yet · ${pass}` : pass}
        />
        <Tile
          label="Homework handed in"
          value={
            <>
              {tiles.homework ?? '—'}
              {tiles.homework !== null && <small>%</small>}
            </>
          }
          note="Homework that was due, on average"
        />
      </div>
      <div className="grid g2 start">
        <ColumnCard
          title="Attendance by week"
          subtitle="Present or late, as a share of the students expected"
          items={stats.attendance.map((a) => ({
            label: `Week ${a.week} · ${formatDate(a.date)}`,
            short: `Week ${a.week}`,
            value: a.percent,
          }))}
          unit="%"
          labelHead="Week"
          valueHead="Attendance"
          empty="No attendance taken yet."
        />
        <LineCard
          title="Score trend by week"
          subtitle={`Class average on the work set each week · line = ${pass.toLowerCase()}`}
          series={[
            {
              name: 'Class average',
              points: stats.trend.map((t) => ({ label: `Wk ${t.week}`, full: `Week ${t.week}`, value: t.average })),
            },
          ]}
          refValue={passMark}
          refLabel={pass}
          empty="Nothing marked yet."
        />
        <BarListCard
          title="Average score by task"
          subtitle={`Class average as a percentage, late penalties taken off · tick = ${pass.toLowerCase()}`}
          items={stats.tasks.map((t) => ({
            label: t.title,
            sub: `${KIND_LABEL[t.kind]}${t.week ? ` · week ${t.week}` : ''}`,
            value: t.average,
          }))}
          valueHead="Average"
          refValue={passMark}
          refLabel={pass}
          empty="Nothing marked yet."
        />
        <ColumnCard
          title="Spread of current standings"
          subtitle="Number of students in each score band"
          items={tiles.withScore ? stats.bands.map((b) => ({ label: `${b.label} points`, short: b.label, value: b.count })) : []}
          labelHead="Score band"
          valueHead="Students"
          empty="Nothing marked yet."
        />
        <BarListCard
          title="Topics to revisit"
          subtitle="Average score on the work set in the weeks that covered each topic, lowest first"
          items={stats.topics.map((t) => ({
            label: t.topic,
            sub: `${t.counted} ${t.counted === 1 ? 'score' : 'scores'}`,
            value: t.average,
          }))}
          valueHead="Average"
          refValue={passMark}
          refLabel={pass}
          empty="No marked work is linked to syllabus topics yet. Topics come from each week’s lesson and weekly report."
        />
      </div>
    </>
  );
}
