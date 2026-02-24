// Friction Page Script
document.addEventListener('DOMContentLoaded', function() {
    // Get the blocked site URL from query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const originalUrl = urlParams.get('originalUrl');

    // Set the blocked site in the UI
    if (originalUrl) {
        document.getElementById('blocked-site').textContent = new URL(originalUrl).hostname;
    } else {
        document.getElementById('blocked-site').textContent = 'Unknown destination';
    }

    // Track when the challenge starts
    let startTime = null;

    // Set up the single challenge button
    document.getElementById('start-unlock-challenge').addEventListener('click', function() {
        // Show confirmation modal
        if (confirm('Ready to earn access with FocusGate? You will complete 5 productivity-focused paragraphs with full accuracy.')) {
            startTime = Date.now(); // Record start time when challenge begins
            startTypingChallenge(originalUrl);
        }
    });

    // Set up close tab button
    document.getElementById('close-tab-btn').addEventListener('click', function() {
        // Close the current tab
        window.close();
    });

    // Set up Google button (handled by HTML link)
});

// Function to format seconds into MM:SS format
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startTypingChallenge(originalUrl) {
    // Hide challenge options
    document.querySelector('.challenge-selection').style.display = 'none';

    // Show typing challenge with 5 productivity paragraphs
    showTypingChallenge(originalUrl);
}

function showTypingChallenge(originalUrl) {
    // 1. Clear the main content area carefully
    const container = document.querySelector('.content');
    
    // We want to hide the initial UI, not delete it, so we can toggle back if needed
    // But based on your code, we are appending. Let's clean the container for the challenge view.
    container.innerHTML = ''; 

    // 2. Create the wrapper
    const challengeDiv = document.createElement('div');
    challengeDiv.className = 'challenge-container';

    // Productivity-focused paragraphs
const productivityTexts = [
    "Every minute wasted on distractions is a minute stolen from your potential. Protect your time like it’s the most valuable asset you own.",
    "Focus is a muscle. The more you practice resisting trivial distractions, the stronger it becomes. Train daily.",
    "Clarity about your priorities is the antidote to distraction. When you know what truly matters, saying no becomes effortless.",
    "The path to mastery is built one deliberate action at a time. Small, consistent steps outweigh sporadic bursts of effort.",
    "Discipline is choosing what you want most over what you want now. Every conscious decision shapes your future self.",
    "Productivity isn’t about doing more; it’s about doing what aligns with your highest goals. Cut away the rest ruthlessly.",
    "Every time you pause to question your browsing habits, you reclaim control over your attention. Awareness is freedom.",
    "Your time is finite. Every distraction you resist is a vote for the life you actually want to live.",
    "Focus on the vital few, not the trivial many. Let each action bring you closer to what truly matters.",
    "Temporary pleasure is a mirage; lasting fulfillment comes from achievements aligned with your vision.",
    "The future you will thank you for the effort you make today. Your small victories compound into unstoppable momentum.",
    "Distractions are silent thieves. Protect your mind and energy by creating intentional friction against them.",
    "Energy spent on meaningless scrolling is energy stolen from your creativity, learning, and growth.",
    "Action beats intention every time. Thinking about productivity isn’t enough; doing is what creates change.",
    "Your attention is the most valuable currency. Spend it only on what enriches your life and moves you forward.",
    "Focus is freedom. The more you control your attention, the less you are a slave to external noise.",
    "Every small effort adds up. Resist the urge to postpone hard tasks; the compound effect rewards consistency.",
    "Self-control is the tool that allows your intentions to become reality. Hone it daily through deliberate practice.",
    "Choose effort that aligns with your purpose, not convenience. The hard path today leads to a life of freedom tomorrow.",
    "Discipline beats motivation. Motivation fluctuates; habits and systems endure.",
    "Resist distractions like a guardian of your future self. Protect the life you are building from theft by triviality.",
    "Progress requires focus. Each time you redirect attention from a distraction to a meaningful task, you grow stronger.",
    "Time invested in growth compounds faster than time spent on mindless entertainment. Make it count.",
    "Your mind is a garden. What you water grows. Focus cultivates strength; distractions breed weakness.",
    "Every intentional action today builds momentum for tomorrow. Build it wisely.",
    "Productivity isn’t punishment; it’s liberation from the chaos of unintentional living.",
    "Your choices today dictate your outcomes tomorrow. Choose deliberately, act intentionally.",
    "Attention is your superpower. Where you place it defines your life trajectory.",
    "Resist the lure of mindless consumption. Energy spent on creation builds legacy, not distraction.",
    "The strongest people are not those with the most time, but those who master their focus within limited time.",
    "Every small victory against procrastination strengthens your confidence and self-trust.",
    "Purpose-driven effort trumps busywork every time. Ask yourself: does this action align with my goals?",
    "Distraction is the enemy of progress. Confront it with structured action and deliberate resistance.",
    "Even 5 minutes of focused work beats an hour of unfocused busyness. Commit to deep attention.",
    "The choices you make in private define your public results. Protect your attention relentlessly.",
    "Small actions, consistently taken, forge habits that shape identity and destiny.",
    "A productive mind requires boundaries. Guard your focus like a valuable asset.",
    "Growth is the result of deliberate discomfort. Resist ease to gain strength.",
    "Every task you complete intentionally is a vote for the person you want to become.",
    "Discipline isn’t oppressive; it’s the architecture that supports freedom and achievement.",
    "Your potential grows in proportion to the challenges you willingly embrace and distractions you avoid.",
    "Time is irreversible. Choose actions that build momentum toward meaningful outcomes.",
    "Focus creates clarity, and clarity drives results. Protect both fiercely.",
    "Intentional effort over instant gratification creates a life you can be proud of.",
    "Every day is an opportunity to invest in your future self. Don’t squander it on trivialities.",
    "Success isn’t found in the absence of distraction, but in the ability to act despite it.",
    "Your habits are the scaffolding of your achievements. Strengthen them with purposeful action.",
    "Every challenge you complete today reinforces your ability to overcome tomorrow’s distractions.",
    "Self-mastery is built one decision at a time. Each choice shapes the trajectory of your life.",
    "Discipline is a skill. Like any skill, it improves with practice and deliberate resistance to temptation."
];

    // Function to get 5 random paragraphs from the array
    function getRandomParagraphs() {
        const shuffled = [...productivityTexts].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 5);
    }

    const selectedParagraphs = getRandomParagraphs();
    let currentParagraphIndex = 0;
    let completedParagraphs = 0;

    function displayCurrentParagraph() {
        const currentText = selectedParagraphs[currentParagraphIndex];

        // --- NEW IMPROVED HTML STRUCTURE ---
        challengeDiv.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <span class="step-badge">Level ${currentParagraphIndex + 1} of 5</span>
                <p class="instruction-text">Type the text below exactly to earn access.</p>
            </div>

            <div class="quote-box">
                <p class="quote-text">"${currentText}"</p>
            </div>

            <textarea id="typing-input" class="typing-input" placeholder="Start typing here..."></textarea>

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
        // -----------------------------------

        // Ensure container is empty before adding the new challenge div
        container.innerHTML = '';
        container.appendChild(challengeDiv);

        const typingInput = document.getElementById('typing-input');
        const charCount = document.getElementById('char-count');
        const accuracySpan = document.getElementById('accuracy');
        const submitBtn = document.getElementById('submit-typing');
        const quoteBox = document.querySelector('.quote-box');

        typingInput.focus();

        // Prevent Cheating (Context Menu & Shortcuts)
        typingInput.addEventListener('contextmenu', e => e.preventDefault());
        typingInput.addEventListener('paste', e => {
            e.preventDefault();
            alert("No shortcuts in FocusGate. Earn it.");
        });

        // Block Shortcuts
        typingInput.addEventListener('keydown', function(e) {
             if (e.ctrlKey && (['a','c','v','x'].includes(e.key.toLowerCase()))) {
                e.preventDefault();
            }
        });

        let userStartedTyping = false;

        typingInput.addEventListener('input', function() {
            const typedText = typingInput.value;
            charCount.textContent = typedText.length;

            // visual feedback: dim the quote when typing starts
            if (!userStartedTyping && typedText.length > 0) {
                userStartedTyping = true;
                quoteBox.classList.add('dimmed');
            } else if (typedText.length === 0) {
                userStartedTyping = false;
                quoteBox.classList.remove('dimmed');
            }

            // Accuracy Logic
            let correctChars = 0;
            for (let i = 0; i < typedText.length; i++) {
                if (i < currentText.length && typedText[i] === currentText[i]) {
                    correctChars++;
                }
            }

            const accuracy = typedText.length > 0 ? Math.round((correctChars / typedText.length) * 100) : 100;
            accuracySpan.textContent = `${accuracy}%`;

            // Colorize Accuracy
            accuracySpan.style.color = accuracy === 100 ? 'var(--success-color, #10b981)' : 'var(--danger-color, #ef4444)';

            // Validation
            const isCorrect = typedText === currentText;
            submitBtn.disabled = !isCorrect;

            // Visual cue for button
            if(isCorrect) {
                submitBtn.style.opacity = '1';
                submitBtn.innerText = "Continue →";
            } else {
                submitBtn.innerText = "Submit";
            }
        });

        // Submit Logic
        submitBtn.addEventListener('click', function() {
            if (typingInput.value === currentText) {
                completedParagraphs++;
                if (completedParagraphs === 5) {
                    completeChallenge(1440, originalUrl);
                } else {
                    currentParagraphIndex++;
                    displayCurrentParagraph();
                }
            }
        });

        // Reset Logic
        document.getElementById('reset-typing').addEventListener('click', function() {
            typingInput.value = '';
            typingInput.focus();
            charCount.textContent = '0';
            accuracySpan.textContent = '100%';
            submitBtn.disabled = true;
            quoteBox.classList.remove('dimmed');
            userStartedTyping = false;
        });

        // Cancel Logic - Reloads the page to go back to initial state
        document.getElementById('cancel-challenge').addEventListener('click', function() {
             location.reload();
        });
    }

    displayCurrentParagraph();
}

function completeChallenge(duration, originalUrl) {
    // Calculate time spent on challenge (in seconds)
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    // Send message to background script to grant temporary access
    chrome.runtime.sendMessage({
        action: "grantTemporaryAccess",
        urlPattern: new URL(originalUrl).hostname,
        duration: parseInt(duration),
        timeSpent: timeSpent
    }, function(response) {
        if (response && response.success) {
            // Show success message
            document.querySelector('.content').innerHTML = `
                <div class="success-message">
                    <h2>Access Earned</h2>
                    <p>You completed all 5 FocusGate typing rounds.</p>
                    <p>Temporary access is now active for 24 hours.</p>
                    <p>Time invested: ${formatTime(timeSpent)}</p>
                    <p>Continue when you're ready:</p>
                    <a href="${originalUrl}" class="btn btn-primary" style="display: inline-block; margin-top: 20px;">Continue to Site</a>
                </div>
            `;
        } else {
            alert('FocusGate could not grant access. Please try again.');
            // Re-show challenge selection after error
            document.querySelector('.challenge-container').remove();
            document.querySelector('.challenge-selection').style.display = 'block';
        }
    });
}

// Function to format seconds into MM:SS format
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
