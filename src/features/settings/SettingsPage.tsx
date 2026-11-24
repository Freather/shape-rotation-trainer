import { useSettings } from '../../store';

export function SettingsPage() {
  const s = useSettings();
  return (
    <div className="panel">
      <h2>설정</h2>
      <div className="form vertical">
        <label className="check">
          <input type="checkbox" checked={s.mono} onChange={(e) => s.set({ mono: e.target.checked })} /> 흑백으로 보기. 실제 시험지처럼 면에 색을 칠하지 않아요
        </label>
        <label>
          시간 제한 방식
          <select value={s.timerMode} onChange={(e) => s.set({ timerMode: e.target.value as 'perQuestion' | 'total' })}>
            <option value="perQuestion">문제마다</option>
            <option value="total">전체 합계</option>
          </select>
        </label>
        <label>
          한 문제당 시간(초)
          <input type="number" min={5} max={300} value={s.timePerQuestion} onChange={(e) => s.set({ timePerQuestion: Number(e.target.value) || 40 })} />
        </label>
        <label>
          전체 시간(초)
          <input type="number" min={30} max={3600} value={s.totalTime} onChange={(e) => s.set({ totalTime: Number(e.target.value) || 600 })} />
        </label>
        <label>
          실전 문제 수
          <input type="number" min={1} max={50} value={s.examCount} onChange={(e) => s.set({ examCount: Number(e.target.value) || 15 })} />
        </label>
        <label>
          규칙 페이지 시간(초, 0이면 제한 없음)
          <input type="number" min={0} max={600} value={s.ruleTimer} onChange={(e) => s.set({ ruleTimer: Number(e.target.value) || 0 })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={s.allowRuleReviewInExam} onChange={(e) => s.set({ allowRuleReviewInExam: e.target.checked })} /> 실전에서도 문제 푸는 중에 규칙 다시 보기
        </label>
        <label className="check">
          <input type="checkbox" checked={s.allowMirrorRules} onChange={(e) => s.set({ allowMirrorRules: e.target.checked })} /> 입체 규칙에 거울 반전도 넣기
        </label>
        <button onClick={s.reset}>처음 설정으로</button>
      </div>
      <h3>회전 방향 읽는 법</h3>
      <ul className="muted">
        <li>X는 오른쪽, Y는 위, Z는 화면에서 나를 향하는 쪽이에요.</li>
        <li>'앞에서 볼 때 시계방향'은 앞에서 도형을 보며 시계 바늘 방향으로 돌린다는 뜻이에요. 위, 오른쪽도 같아요. 그림은 살짝 비스듬히 보여서 앞이 정확히 화면 한가운데는 아니에요. 문제 그림에 빨간 점으로 앞·위·오른쪽을 표시해 둬요.</li>
        <li>앞으로 굴리면 윗면이 앞으로, 오른쪽으로 굴리면 윗면이 오른쪽으로 가요.</li>
        <li>'○ 면을 정면에서 보고 시계방향'은 그 면을 바깥에서 마주 보고 시계 방향으로 돌린다는 뜻이에요.</li>
      </ul>
    </div>
  );
}
