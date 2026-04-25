const fs = require('fs');
const path = require('path');

const files = [
  'index.html',
  'sponsors.html',
  'our-team.html',
  'guidelines.html',
  'register.html',
  'schedule.html',
  'code-of-conduct.html',
  'about.html',
  'problem-statement.html',
  'contact.html',
  'winners.html'
];

const screensaverLink = `                  <a href="/screensaver" class="md-item" role="menuitem" tabindex="-1">
                    <div class="md-item__icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    </div>
                    <div class="md-item__body">
                      <span class="md-item__title">Screensaver</span>
                      <span class="md-item__desc">Live event display</span>
                    </div>
                  </a>
`;

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Search for the end of the md-items container. Usually it looks like:
  //                 </div>
  //               </div>
  //             </div>
  //           </li>
  // Or look for the Sponsors block to insert after it.
  
  const sponsorsBlockEndIndex = content.indexOf('<span class="md-item__title">Sponsors</span>');
  if (sponsorsBlockEndIndex === -1) {
    console.log(`Could not find Sponsors block in ${file}`);
    return;
  }
  
  const insertIndex = content.indexOf('</a>', sponsorsBlockEndIndex) + 4;
  
  if (content.includes('Screensaver</span>')) {
    console.log(`Screensaver already in ${file}`);
    return;
  }

  content = content.slice(0, insertIndex) + '\n' + screensaverLink + content.slice(insertIndex);
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
});
