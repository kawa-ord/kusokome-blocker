
/**
 * K-Blocker Content Script v2.1
 * Yahoo!ニュースコメント欄の低品質コメント非表示システム
 *
 * 【v2.1 修正内容】
 * - 新しいYahoo!ニュースDOM構造に対応
 * - コメント外枠とコメント本体を分離
 * - 表示中のリアクションボタンから投票数を取得
 * - 投票数の取得に失敗した場合は再試行
 * - DOMのinnerHTMLを破壊しない非表示・再表示方式
 * - 非表示通知・再表示ボタンの重複を防止
 */

// DOMセレクタ
const SELECTORS = {
  commentWrapper: "article.sc-b798a33e-0",
  commentBody: "article.sc-93daaf6c-3",
  voteList: "ul.sc-cecd0f40-0",
};

// 非表示UIのクラス名
const HIDDEN_NOTICE_CLASS = "k-blocker-hidden-notice";
const SHOW_BUTTON_CLASS = "k-blocker-show-button";
const CLOSE_BUTTON_CLASS = "k-blocker-close-button";

/**
 * 数値文字列を数値に変換（万単位・カンマ対応）
 * @param {string} text
 * @returns {number|null}
 */
function parseVoteNumber(text) {
  const match = text.match(/([\d,.]+)/);

  if (!match) {
    return null;
  }

  let num = parseFloat(match[1].replace(/,/g, ""));

  if (!Number.isFinite(num)) {
    return null;
  }

  if (text.includes("万")) {
    num *= 10000;
  }

  return Math.floor(num);
}

/**
 * コメント外枠からリアクション数を抽出
 * @param {Element} wrapper
 * @returns {{kyoukan:number, naruhodo:number, uun:number}|null}
 */
function extractVoteData(wrapper) {
  const voteButtonContainer = wrapper.querySelector(SELECTORS.voteList);

  if (!voteButtonContainer) {
    return null;
  }

  const buttons = [...voteButtonContainer.querySelectorAll("button")];

  /**
   * 表示中の指定リアクション数を取得
   * @param {string} label
   * @returns {number|null}
   */
  const getVisibleVoteCount = (label) => {
    const button = buttons.find((button) => {
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();

      return (
        button.innerText.includes(label) &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });

    if (!button) {
      return null;
    }

    const text = button.innerText.replace(/\s+/g, "");
    const countText = text.replace(label, "");

    if (!/[\d,.]+/.test(countText)) {
      return null;
    }

    return parseVoteNumber(countText);
  };

  const kyoukan = getVisibleVoteCount("共感した");
  const naruhodo = getVisibleVoteCount("なるほど");
  const uun = getVisibleVoteCount("うーん");

  if (
    kyoukan === null ||
    naruhodo === null ||
    uun === null
  ) {
    return null;
  }

  return {
    kyoukan,
    naruhodo,
    uun,
  };
}

/**
 * 判定基準に基づいてコメントを非表示にするか判定
 * @param {{kyoukan:number, naruhodo:number, uun:number}} voteData
 * @returns {boolean}
 */
function shouldBlockComment(voteData) {
  const { kyoukan, naruhodo, uun } = voteData;

  const totalVotes = kyoukan + naruhodo + uun;

  // 判定基準0：全ての投票が0
  if (totalVotes === 0) {
    return true;
  }

  // 判定基準1：総投票数が10件未満
  if (totalVotes < 10) {
    return true;
  }

  // 判定基準2：「うーん」が肯定票を上回る
  const positiveVotes = kyoukan + naruhodo;

  if (uun > positiveVotes) {
    return true;
  }

  // 判定基準3：「うーん」が総投票数の50%以上
  const uunPercentage = (uun / totalVotes) * 100;

  if (uunPercentage >= 50) {
    return true;
  }

  return false;
}

/**
 * コメント本体を非表示にする
 * DOMのinnerHTMLは変更しない
 * @param {Element} commentElement
 */
function hideComment(commentElement) {
  // すでに非表示通知が存在する場合は重複処理しない
  if (
    commentElement.nextElementSibling?.classList.contains(
      HIDDEN_NOTICE_CLASS
    )
  ) {
    return;
  }

  const originalDisplay = commentElement.style.display;

  commentElement.style.display = "none";

  // 非表示通知
  const notice = document.createElement("div");
  notice.className = HIDDEN_NOTICE_CLASS;
  notice.textContent = "非表示にしました";

  // 再表示ボタン
  const showButton = document.createElement("button");
  showButton.type = "button";
  showButton.className = SHOW_BUTTON_CLASS;
  showButton.textContent = "表示する";

  notice.appendChild(showButton);

  commentElement.insertAdjacentElement("afterend", notice);

  // 再表示処理
  showButton.addEventListener("click", () => {
    commentElement.style.display = originalDisplay;
    notice.remove();

    // 再表示後の非表示ボタン
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = CLOSE_BUTTON_CLASS;
    closeButton.textContent = "非表示";

    closeButton.addEventListener("click", () => {
      hideComment(commentElement);
      closeButton.remove();
    });

    commentElement.insertAdjacentElement("afterend", closeButton);
  });
}

/**
 * 単一のコメントを処理
 * @param {Element} wrapper
 */
function processComment(wrapper) {
  const commentElement = wrapper.querySelector(SELECTORS.commentBody);

  if (!commentElement) {
    return;
  }

  // 処理済みチェック
  if (commentElement.hasAttribute("data-k-blocker-processed")) {
    return;
  }

  // 外枠からリアクション数を取得
  const voteData = extractVoteData(wrapper);

  // 取得できなければ処理済みにせず、次回スキャンで再試行
  if (!voteData) {
    return;
  }

  // 正常に取得できた時点で処理済みにする
  commentElement.setAttribute("data-k-blocker-processed", "true");

  console.log("K-Blocker: コメント分析", voteData);

  if (shouldBlockComment(voteData)) {
    console.log("K-Blocker: 非表示処理実行");
    hideComment(commentElement);
  }
}

/**
 * コメントを検出して処理
 */
function detectAndProcessComments() {
  const commentWrappers = document.querySelectorAll(
    SELECTORS.commentWrapper
  );

  if (commentWrappers.length === 0) {
    console.log("K-Blocker: コメントが見つかりません");
    return;
  }

  console.log(
    `K-Blocker: ${commentWrappers.length}件のコメント外枠を検出`
  );

  commentWrappers.forEach(processComment);
}

/**
 * MutationObserverのコールバック
 */
function onDomChange() {
  setTimeout(() => {
    detectAndProcessComments();
  }, 800);
}

/**
 * 初期化処理
 */
function init() {
  console.log("K-Blocker v2.1: 初期化開始");

  // 初回スキャン
  setTimeout(() => {
    detectAndProcessComments();
  }, 1500);

  // DOM変更監視
  const observer = new MutationObserver(onDomChange);

  const targetNode =
    document.querySelector("#contents") || document.body;

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  // 定期スキャン
  setInterval(() => {
    detectAndProcessComments();
  }, 10000);

  console.log("K-Blocker v2.1: 初期化完了");
}

// ページ読み込み完了後に初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
