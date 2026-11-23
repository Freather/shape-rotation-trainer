import { useSettings } from '../../store';

export function SettingsPage() {
  const s = useSettings();
  return (
    <div className="panel">
      <h2>설정</h2>
      <div className="form vertical">
        <label className="check">
          <input type="checkbox" checked={s.mono} onChange={(e) => s.set({ mono: e.target.checked })} /> 흑백 모드 (면 색 없이 기호만 — 실제 시험처럼)
        </label>
        <label>
          제한시간 방식
          <select value={s.timerMode} onChange={(e) => s.set({ timerMode: e.target.value as 'perQuestion' | 'total' })}>
            <option value="perQuestion">문항당 제한시간</option>
            <option value="total">세트 전체 제한시간</option>
          </select>
        </label>
        <label>
          문항당 제한시간(초)
          <input type="number" min={5} max={300} value={s.timePerQuestion} onChange={(e) => s.set({ timePerQuestion: Number(e.target.value) || 40 })} />
        </label>
        <label>
          세트 전체 제한시간(초)
          <input type="number" min={30} max={3600} value={s.totalTime} onChange={(e) => s.set({ totalTime: Number(e.target.value) || 600 })} />
        </label>
        <label>
          실전 세트 문항 수
          <input type="number" min={1} max={50} value={s.examCount} onChange={(e) => s.set({ examCount: Number(e.target.value) || 15 })} />
        </label>
        <label>
          규칙 설명 페이지 제한시간(초, 0 = 없음)
          <input type="number" min={0} max={600} value={s.ruleTimer} onChange={(e) => s.set({ ruleTimer: Number(e.target.value) || 0 })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={s.allowRuleReviewInExam} onChange={(e) => s.set({ allowRuleReviewInExam: e.target.checked })} /> 실전 모드에서 "규칙 보기" 허용
        </label>
        <label className="check">
          <input type="checkbox" checked={s.allowMirrorRules} onChange={(e) => s.set({ allowMirrorRules: e.target.checked })} /> 입체 규칙에 "좌우 반전(거울)" 포함 (확장)
        </label>
        <button onClick={s.reset}>기본값으로</button>
      </div>
      <h3>회전 방향 규약</h3>
      <ul className="muted">
        <li>X = 오른쪽, Y = 위, Z = 화면 밖(나를 향함)</li>
        <li>"앞에서 볼 때 시계방향 θ" = Z축 기준 −θ, "위에서 볼 때" = Y축, "오른쪽에서 볼 때" = X축</li>
        <li>앞으로 굴리기 = 윗면이 앞으로 / 오른쪽으로 굴리기 = 윗면이 오른쪽으로</li>
        <li>"○ 면을 바라볼 때 시계방향" = 그 면을 바깥에서 정면으로 볼 때 시계방향</li>
      </ul>
    </div>
  );
}
