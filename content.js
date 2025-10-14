/**
 * K-Blocker Content Script v1.1
 * Yahoo!Newsコメント欄の低品質コメント非表示システム
 *
 * 【修正内容】
 * - コメント検出の精度を大幅に向上
 * - 記事本体への誤爆を完全防止
 * - より厳密なセレクタに変更
 */

// 処理済みコメントを記録（重複処理防止）
const processedComments = new Set();

/**
 * コメント要素から投票数データを抽出
 * @param {Element} commentElement - コメント要素
 * @returns {Object|null} 投票数オブジェクト or null
 */
function extractVoteData(commentElement) {
  try {
    // 投票ボタン部分を探す
    const voteButtons = commentElement.querySelectorAll("button, span, div");

    let kyoukan = 0; // 共感した
    let naruhodo = 0; // なるほど
    let uun = 0; // うーん

    for (const element of voteButtons) {
      const text = element.textContent.trim();

      // テキストから投票数を抽出
      if (text.includes("共感した")) {
        const match = text.match(/(\d+)/);
        if (match) kyoukan = parseInt(match[1], 10);
      } else if (text.includes("なるほど")) {
        const match = text.match(/(\d+)/);
        if (match) naruhodo = parseInt(match[1], 10);
      } else if (text.includes("うーん")) {
        const match = text.match(/(\d+)/);
        if (match) uun = parseInt(match[1], 10);
      }
    }

    // 全てが0の場合はデータ未読込と判断
    if (kyoukan === 0 && naruhodo === 0 && uun === 0) {
      return null;
    }

    return { kyoukan, naruhodo, uun };
  } catch (error) {
    console.error("K-Blocker: 投票データ抽出エラー", error);
    return null;
  }
}

/**
 * 判定基準に基づいてコメントをブロックすべきか判定
 * @param {Object} voteData - 投票数データ
 * @returns {boolean} true=非表示にすべき, false=表示OK
 */
function shouldBlockComment(voteData) {
  const { kyoukan, naruhodo, uun } = voteData;

  // 総投票数
  const totalVotes = kyoukan + naruhodo + uun;

  // 【判定基準1】総投票数が10件未満は非表示
  if (totalVotes < 10) {
    return true;
  }

  // 【判定基準2】「うーん」が「共感した」+「なるほど」を上回る場合は非表示
  const positiveVotes = kyoukan + naruhodo;
  if (uun > positiveVotes) {
    return true;
  }

  // 【判定基準3】「うーん」が50%以上の場合は非表示
  const uunPercentage = (uun / totalVotes) * 100;
  if (uunPercentage >= 50) {
    return true;
  }

  // 全ての判定をパスした場合は表示OK
  return false;
}

/**
 * コメントを非表示にする処理
 * @param {Element} commentElement - 対象コメント要素
 */
function hideComment(commentElement) {
  // 既に処理済みならスキップ
  if (commentElement.hasAttribute("data-k-blocker-hidden")) {
    return;
  }

  // 元のコメント内容を保存
  const originalHTML = commentElement.innerHTML;
  const originalDisplay = commentElement.style.display || "";

  // 非表示マーカーを追加
  commentElement.setAttribute("data-k-blocker-hidden", "true");
  commentElement.setAttribute("data-k-blocker-original-html", originalHTML);
  commentElement.setAttribute("data-k-blocker-original-display", originalDisplay);

  // トグル用の表示要素を作成
  const hiddenNotice = document.createElement("div");
  hiddenNotice.className = "k-blocker-hidden-notice";
  hiddenNotice.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background-color: #fef5f5;
    border-left: 3px solid #e74c3c;
    border-radius: 4px;
    margin: 4px 0;
    font-size: 13px;
  `;

  hiddenNotice.innerHTML = `
    <span style="color: #666; font-style: italic;">非表示にしました</span>
    <button class="k-blocker-toggle" style="
      padding: 4px 12px;
      background-color: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    ">表示する</button>
  `;

  // トグルボタンのクリックイベント
  const toggleButton = hiddenNotice.querySelector(".k-blocker-toggle");
  toggleButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 元のHTMLを復元
    commentElement.innerHTML = originalHTML;
    commentElement.style.display = originalDisplay;

    // 閉じるボタンを追加
    const closeButton = document.createElement("button");
    closeButton.className = "k-blocker-close-btn";
    closeButton.textContent = "閉じる";
    closeButton.style.cssText = `
      display: block;
      margin-top: 12px;
      padding: 6px 16px;
      background-color: #95a5a6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    `;
    closeButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 再度非表示にする
      commentElement.innerHTML = "";
      commentElement.appendChild(hiddenNotice);
    });

    commentElement.appendChild(closeButton);
  });

  // コメント内容を非表示通知に置き換え
  commentElement.innerHTML = "";
  commentElement.appendChild(hiddenNotice);
}

/**
 * 単一のコメント要素を処理
 * @param {Element} commentElement - コメント要素
 */
function processComment(commentElement) {
  // 処理済みチェック
  const commentId = commentElement.getAttribute("data-comment-id") || commentElement.getAttribute("data-cid") || commentElement.id || Math.random().toString(36);

  if (processedComments.has(commentId)) {
    return;
  }

  // 処理済みマーク
  processedComments.add(commentId);

  // 投票データを抽出
  const voteData = extractVoteData(commentElement);

  // データが取得できない場合はスキップ
  if (!voteData) {
    processedComments.delete(commentId); // 再試行可能にする
    return;
  }

  console.log("K-Blocker: コメント分析", { commentId, voteData });

  // ブロック判定
  if (shouldBlockComment(voteData)) {
    console.log("K-Blocker: 非表示処理実行", commentId);
    hideComment(commentElement);
  }
}

/**
 * コメント要素を検出（厳密版）
 * Yahoo!コメント欄の実際の構造に基づいた検出
 */
function detectAndProcessComments() {
  // コメントコンテナを特定
  // Yahoo!のコメント欄は #contents 以下にある
  const contentsArea = document.querySelector('#contents, [id*="comment"]');

  if (!contentsArea) {
    console.log("K-Blocker: コメントエリアが見つかりません");
    return;
  }

  // コメント要素の候補を取得
  // Yahoo!コメントは通常 li 要素または特定のdivで構成されている
  const commentCandidates = contentsArea.querySelectorAll('li, [data-cid], [id*="comment-"]');

  let foundComments = 0;

  for (const candidate of commentCandidates) {
    const text = candidate.textContent;

    // コメント要素の条件:
    // 1. 投票ボタンのテキストを含む
    // 2. ある程度の長さがある（広告などを除外）
    // 3. 記事本体ではない
    const hasVoteButtons = text.includes("共感した") && text.includes("なるほど") && text.includes("うーん");

    const hasReasonableLength = text.length > 50 && text.length < 5000;

    // 記事本体や関係ない要素を除外
    const isNotArticle = !candidate.matches("article") || candidate.querySelector('[role="button"]') !== null;

    if (hasVoteButtons && hasReasonableLength && isNotArticle) {
      foundComments++;
      processComment(candidate);
    }
  }

  if (foundComments > 0) {
    console.log(`K-Blocker: ${foundComments}件のコメントを検出しました`);
  }
}

/**
 * MutationObserverのコールバック
 */
function onDomChange(mutations) {
  // 少し遅延させて、投票数の読み込みを待つ
  setTimeout(() => {
    detectAndProcessComments();
  }, 800);
}

/**
 * 初期化処理
 */
function init() {
  console.log("K-Blocker: 初期化開始");

  // 初回スキャン（少し遅延させる）
  setTimeout(() => {
    detectAndProcessComments();
  }, 1500);

  // MutationObserverを設定
  const observer = new MutationObserver(onDomChange);

  // コメントエリアのみ監視（より限定的に）
  const targetNode = document.querySelector("#contents") || document.body;

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  // 定期的な再スキャン（10秒ごと）
  setInterval(() => {
    detectAndProcessComments();
  }, 10000);

  console.log("K-Blocker: 初期化完了");
}

// ページ読み込み完了後に初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
