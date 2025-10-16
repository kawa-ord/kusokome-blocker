/**
 * K-Blocker Content Script v1.2
 * Yahoo!Newsコメント欄の低品質コメント非表示システム
 *
 * 【v1.2 修正内容】
 * - コメント本体のみを正確にターゲット（article.sc-169yn8p-3）
 * - 全ての投票が0の場合を非表示対象に追加
 * - 記事本体や削除ダイアログへの誤爆を完全防止
 */

// 処理済みコメントを記録（重複処理防止）
const processedComments = new Set();

/**
 * 数値文字列を数値に変換（万単位・カンマ対応）
 * @param {string} text - "1.8万" or "1,234" or "308" 形式の文字列
 * @returns {number} 数値
 */
function parseVoteNumber(text) {
  // 数値部分を抽出（小数点・カンマ含む）
  const match = text.match(/([\d,.]+)/);
  if (!match) return 0;

  // カンマを除去して数値化
  let num = parseFloat(match[1].replace(/,/g, ""));

  // 「万」が含まれている場合は10000倍
  if (text.includes("万")) {
    num = num * 10000;
  }

  return Math.floor(num);
}

/**
 * コメント要素から投票数データを抽出
 * @param {Element} commentElement - コメント要素
 * @returns {Object|null} 投票数オブジェクト or null
 */
function extractVoteData(commentElement) {
  try {
    // 投票ボタン部分を探す（より具体的なセレクタ）
    // Yahoo!の構造: ul.sc-11pem1p-0 > li > button
    const voteButtonContainer = commentElement.querySelector("ul.sc-11pem1p-0");

    if (!voteButtonContainer) {
      return null;
    }

    let kyoukan = 0; // 共感した
    let naruhodo = 0; // なるほど
    let uun = 0; // うーん

    // 各投票ボタンから数値を抽出（万単位対応）
    const buttons = voteButtonContainer.querySelectorAll("button");

    for (const button of buttons) {
      const text = button.textContent.trim();

      // 「共感した」ボタン
      if (text.includes("共感した")) {
        kyoukan = parseVoteNumber(text);
      }
      // 「なるほど」ボタン
      else if (text.includes("なるほど")) {
        naruhodo = parseVoteNumber(text);
      }
      // 「うーん」ボタン
      else if (text.includes("うーん")) {
        uun = parseVoteNumber(text);
      }
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

  // 【判定基準0】全ての投票が0の場合は非表示
  if (totalVotes === 0) {
    return true;
  }

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
      font-size: 11px;
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

    // コメント全体を相対配置にする
    commentElement.style.position = "relative";

    // 閉じるボタンを追加（右上配置・デザイナー仕様）
    const closeButton = document.createElement("button");
    closeButton.className = "k-blocker-close-btn";
    closeButton.textContent = "閉じる";
    closeButton.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 6px 16px;
      background-color: #a8b1b8;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: normal;
      line-height: 1;
      white-space: nowrap;
      z-index: 10;
    `;
    closeButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 再度非表示にする
      commentElement.innerHTML = "";
      commentElement.style.position = ""; // position解除
      commentElement.appendChild(hiddenNotice);
    });

    // 最初の子要素として挿入（一番上に表示）
    commentElement.insertBefore(closeButton, commentElement.firstChild);
  });

  // コメント内容を非表示通知に置き換え
  commentElement.innerHTML = "";
  commentElement.appendChild(hiddenNotice);
}

/**
 * 単一のコメント要素を処理
 * @param {Element} commentElement - コメント要素（article.sc-169yn8p-3）
 */
function processComment(commentElement) {
  // 処理済みチェック
  if (commentElement.hasAttribute("data-k-blocker-processed")) {
    return;
  }

  // 処理済みマーク
  commentElement.setAttribute("data-k-blocker-processed", "true");

  // 投票データを抽出
  const voteData = extractVoteData(commentElement);

  // データが取得できない場合はスキップ
  if (!voteData) {
    return;
  }

  console.log("K-Blocker: コメント分析", voteData);

  // ブロック判定
  if (shouldBlockComment(voteData)) {
    console.log("K-Blocker: 非表示処理実行");
    hideComment(commentElement);
  }
}

/**
 * コメント要素を検出して処理
 * Yahoo!の正確な構造に基づいた検出
 */
function detectAndProcessComments() {
  // コメント本体のみを取得（article.sc-169yn8p-3）
  // これがコメント1件分の実体
  const commentArticles = document.querySelectorAll("article.sc-169yn8p-3");

  if (commentArticles.length === 0) {
    console.log("K-Blocker: コメントが見つかりません");
    return;
  }

  console.log(`K-Blocker: ${commentArticles.length}件のコメントを検出`);

  commentArticles.forEach(processComment);
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
  console.log("K-Blocker v1.2: 初期化開始");

  // 初回スキャン（少し遅延させる）
  setTimeout(() => {
    detectAndProcessComments();
  }, 1500);

  // MutationObserverを設定
  const observer = new MutationObserver(onDomChange);

  // コメントエリアのみ監視
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

  console.log("K-Blocker v1.2: 初期化完了");
}

// ページ読み込み完了後に初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
