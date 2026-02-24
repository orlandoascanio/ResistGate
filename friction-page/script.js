// Friction Page Script
let startTime = null;
let accessDurationMinutes = 15;

document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('originalUrl');

    if (originalUrl) {
        document.getElementById('blocked-site').textContent = new URL(originalUrl).hostname;
    } else {
        document.getElementById('blocked-site').textContent = 'Unknown destination';
    }

    loadAccessWindow();

    document.getElementById('start-unlock-challenge').addEventListener('click', function () {
        if (confirm('Ready to earn access with FocusGate? Complete 5 paragraphs with full accuracy.')) {
            startTime = Date.now();
            startTypingChallenge(originalUrl);
        }
    });

    document.getElementById('close-tab-btn').addEventListener('click', function () {
        window.close();
    });
});

function loadAccessWindow() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, function (response) {
        if (!(response && response.settings)) {
            return;
        }

        const settings = response.settings;
        accessDurationMinutes = settings.defaultAccessDuration
            || settings.challengeTypes?.typing?.duration
            || accessDurationMinutes;
    });
}

function startTypingChallenge(originalUrl) {
    document.querySelector('.challenge-selection').style.display = 'none';
    showTypingChallenge(originalUrl);
}

function showTypingChallenge(originalUrl) {
    const container = document.querySelector('.content');
    container.innerHTML = '';

    const challengeDiv = document.createElement('div');
    challengeDiv.className = 'challenge-container';

    const productivityTexts = [
        "Every minute wasted on distractions is a minute stolen from your potential. Protect your time like it is the most valuable asset you own.",
        "Focus is a muscle. The more you practice resisting trivial distractions, the stronger it becomes.",
        "Discipline is choosing what you want most over what you want now.",
        "Your attention is the most valuable currency. Spend it deliberately.",
        "Progress requires focus. Each time you redirect attention, you grow stronger.",
        "Time is irreversible. Choose actions that build momentum toward meaningful outcomes.",
        "Purpose-driven effort beats busywork. Ask: does this action align with my goals?",
        "Self-mastery is built one decision at a time.",
        "Small actions, consistently taken, shape identity and outcomes.",
        "Distraction is the enemy of progress. Confront it with deliberate resistance."
    ];

    function getRandomParagraphs() {
        const shuffled = [...productivityTexts].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 5);
    }

    const selectedParagraphs = getRandomParagraphs();
    let currentParagraphIndex = 0;
    let completedParagraphs = 0;

    function displayCurrentParagraph() {
        const currentText = selectedParagraphs[currentParagraphIndex];

        challengeDiv.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <span class="step-badge">Challenge ${currentParagraphIndex + 1} of 5</span>
                <p class="instruction-text">Type the paragraph exactly as shown to continue.</p>
            </div>

            <div class="quote-box">
                <p class="quote-text">${currentText}</p>
            </div>

            <textarea id="typing-input" class="typing-input" placeholder="Start typing here..."></textarea>
            <p id="typing-error" class="error-text"></p>

            <div class="stats-row">
                <div class="stat-item">
                    <span>Progress:</span>
                    <span class="stat-value"><span id="char-count">0</span> / ${currentText.length}</span>
                </div>
                <div class="stat-item">
                    <span>Accuracy:</span>
                    <span id="accuracy" class="stat-value">100%</span>
                </div>
            </div>

            <div class="challenge-actions">
                <button id="cancel-challenge" class="btn btn-secondary">Quit</button>
                <button id="reset-typing" class="btn btn-secondary">Reset</button>
                <button id="submit-typing" class="unlock-btn" disabled>Submit</button>
            </div>
        `;

        container.innerHTML = '';
        container.appendChild(challengeDiv);

        const typingInput = document.getElementById('typing-input');
        const charCount = document.getElementById('char-count');
        const accuracySpan = document.getElementById('accuracy');
        const submitBtn = document.getElementById('submit-typing');
        const errorText = document.getElementById('typing-error');

        typingInput.focus();
        typingInput.addEventListener('contextmenu', e => e.preventDefault());
        typingInput.addEventListener('paste', e => {
            e.preventDefault();
            alert('No shortcuts in FocusGate. Earn it.');
        });

        typingInput.addEventListener('keydown', function (e) {
            if (e.ctrlKey && (['a', 'c', 'v', 'x'].includes(e.key.toLowerCase()))) {
                e.preventDefault();
            }
        });

        typingInput.addEventListener('input', function () {
            const typedText = typingInput.value;
            charCount.textContent = typedText.length;

            let correctChars = 0;
            for (let i = 0; i < typedText.length; i++) {
                if (i < currentText.length && typedText[i] === currentText[i]) {
                    correctChars++;
                }
            }

            const accuracy = typedText.length > 0 ? Math.round((correctChars / typedText.length) * 100) : 100;
            accuracySpan.textContent = `${accuracy}%`;
            accuracySpan.style.color = accuracy === 100 ? 'var(--ok)' : 'var(--err)';

            const prefix = currentText.slice(0, typedText.length);
            const hasError = typedText !== prefix;

            typingInput.classList.toggle('has-error', hasError);
            errorText.textContent = hasError ? 'You have a mismatch. Correct it to continue.' : '';

            const isCorrect = typedText === currentText;
            submitBtn.disabled = !isCorrect;
            submitBtn.textContent = isCorrect ? 'Continue' : 'Submit';
        });

        submitBtn.addEventListener('click', function () {
            if (typingInput.value === currentText) {
                completedParagraphs++;
                if (completedParagraphs === 5) {
                    completeChallenge(accessDurationMinutes, originalUrl);
                } else {
                    currentParagraphIndex++;
                    displayCurrentParagraph();
                }
            }
        });

        document.getElementById('reset-typing').addEventListener('click', function () {
            typingInput.value = '';
            typingInput.focus();
            charCount.textContent = '0';
            accuracySpan.textContent = '100%';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submit';
            typingInput.classList.remove('has-error');
            errorText.textContent = '';
        });

        document.getElementById('cancel-challenge').addEventListener('click', function () {
            location.reload();
        });
    }

    displayCurrentParagraph();
}

function completeChallenge(duration, originalUrl) {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    chrome.runtime.sendMessage({
        action: 'grantTemporaryAccess',
        urlPattern: new URL(originalUrl).hostname,
        duration: parseInt(duration, 10),
        timeSpent: timeSpent
    }, function (response) {
        if (response && response.success) {
            document.querySelector('.content').innerHTML = `
                <div class="success-message">
                    <h2>Access Earned</h2>
                    <p>You completed all 5 typing challenges.</p>
                    <p>Temporary access is now active for ${duration} minutes.</p>
                    <p>Time invested: ${formatTime(timeSpent)}</p>
                    <p>Continue when you are ready:</p>
                    <a href="${originalUrl}" class="btn btn-primary" style="display: inline-block; margin-top: 20px;">Continue to Site</a>
                </div>
            `;
        } else {
            alert('FocusGate could not grant access. Please try again.');
            document.querySelector('.challenge-container').remove();
            document.querySelector('.challenge-selection').style.display = 'block';
        }
    });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
