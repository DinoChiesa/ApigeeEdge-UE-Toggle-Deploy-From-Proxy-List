// ==UserScript==
// @namespace   Apigee
// @name        toggle-deploy-from-proxies-list
// @description Toggle the deployment state of a proxy from the proxies list in the Apigee Edge Administrative UI (UE version)
// @match       https://apigee.com/organizations/*/proxies
// @require     https://gist.githubusercontent.com/mjblay/18d34d861e981b7785e407c3b443b99b/raw/debc0e6d4d537ac228d1d71f44b1162979a5278c/waitForKeyElements.js
// @grant       none
// @copyright   2019 Google LLC
// @version     0.1.3
// @run-at      document-end
// @license     Apache 2.0
// ==/UserScript==

/* jshint esversion: 9 */
/* global waitForKeyElements, fetch */

(function (globalScope){
  let timerControl = null;
  var delayAfterPageLoad = 800;
  var delayAfterProgressBar = 650;

  function mylog(){
    Function.prototype.apply.apply(console.log, [console, arguments]);
  }

  function waitForPredicate(predicate, action, controlKey) {
    var controlObj = waitForPredicate.controlObj || {};
    controlKey = controlKey || Math.random().toString(36).substring(2,15);
    var timeControl = controlObj[controlKey];
    var found = predicate();

    if (found) {
      action(found);
      if (timeControl) {
        clearInterval (timeControl);
        delete controlObj [controlKey];
      }
    }
    else {
        if ( ! timeControl) {
            controlObj [controlKey] = setInterval ( function () {
              waitForPredicate(predicate, action, controlKey);
            }, 300 );
        }
    }
    waitForPredicate.controlObj = controlObj;
  }

  function getElementsByTagAndClass(root, tag, clazz) {
    var nodes = root.getElementsByClassName(clazz);
    if (tag) {
      var tagUpper = tag.toUpperCase();
      nodes = Array.prototype.filter.call(nodes,
                                          testElement => testElement.nodeName.toUpperCase() === tagUpper );
    }
    return nodes;
  }

  function getSelectedEnvironment(cb) {
    var nodes = getElementsByTagAndClass(document, 'div', 'alm-environment-dropdown');
    if (nodes && nodes.length == 1) {
      nodes = getElementsByTagAndClass(nodes[0], 'span', 'dropdown-item');
      if (nodes && nodes.length == 1) {
        let envNode = nodes[0];
        nodes = document.getElementsByTagName('csrf');
        if (nodes && nodes.length == 1) {
          let csrf = nodes[0];
          cb(envNode.textContent, csrf.getAttribute('data'));
        }
      }
    }
  }

  function isDeployed(elt) {
    //return (elt.style && elt.style.width && elt.style.width.indexOf('100%') >= 0);
    if (elt.style && elt.style.width) {
      return elt.style.width.indexOf('100%') >= 0;
    }
    return false;
  }

  function toggleDeployOnClick(div, href, environmentName, csrfHeader) {
    return function(event) {
      let checkbox = event.currentTarget, // this
          parts = href.split('/'),
          orgname = parts[2],
          apiname = parts[4],
          rev = parts[6],
          url = 'https://apigee.com/ws/proxy/organizations/' + orgname + '/e/' + environmentName + '/apis/' + apiname + '/revisions/' + rev + '/deployments';

      // event.preventDefault();
      // event.stopPropagation();
      let nodes = getElementsByTagAndClass(div, 'div', 'progress-bar');
      if (nodes && nodes.length == 1) {
        let progressBar = nodes[0],
            headers = {
              'Content-type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json',
              'X-Apigee-CSRF': csrfHeader,
              'X-Requested-With': 'XMLHttpRequest',
              'X-Restart-URL': 'https://apigee.com' + href
            },
            body = 'override=true';

        if(checkbox.checked) {
          if ( ! isDeployed(progressBar)) {
            mylog('deploying...');
            return fetch(url, { method:'POST', headers, body })
              .then(res => {
                if (res.status == 200) {
                  progressBar.style = 'width: 100%;';
                  progressBar.classList.add('deployed');
                }
                else {
                  mylog('deploy failed.');
                  checkbox.checked = false; // revert
                }
              });
          }
        }
        else {
          if (isDeployed(progressBar)) {
            mylog('undeploying...');
            return fetch(url, { method:'DELETE', headers, body })
              .then(res => {
                if (res.status == 200) {
                  progressBar.style = 'width: 0%;';
                  progressBar.classList.remove('deployed');
                }
                else {
                  mylog('undeploy failed.');
                  checkbox.checked = true; // revert
                }
              });
          }
        }
      }
      return null;
    };
  }

  function markupRow(environmentName, csrfHeader) {
    return function(rowNode) {
      var nodes = getElementsByTagAndClass(rowNode, 'a', 'row-anchor-tag');
      if (nodes && nodes.length == 1) {
        let anchor = nodes[0],
            parent = anchor.parentNode;
        // add a checkbox if it is not already there
        if (parent.firstChild.nodeName.toUpperCase() != 'INPUT') {
          let href = anchor.getAttribute('href'), // eg, /platform/gaccelerate3/proxies/linebreaks/overview/5
              checkbox = document.createElement('input');
          checkbox.innerHTML = '';
          checkbox.setAttribute('type', 'checkbox');
          checkbox.setAttribute('title', 'deployment status');
          checkbox.setAttribute('style', 'position: absolute; top: 20px; left:10px; z-index:10;');
          rowNode.setAttribute('style', 'position: relative;');

          nodes = getElementsByTagAndClass(anchor, 'span', 'row-name');
          if (nodes && nodes.length == 1) {
            nodes[0].setAttribute('style', 'margin-left: 10px;');
          }
          nodes = getElementsByTagAndClass(anchor, 'div', 'deployedDot');
          if (nodes && nodes.length == 1) {
            let deployedDotDiv = nodes[0];
            nodes = getElementsByTagAndClass(deployedDotDiv, 'div', 'progress-bar');
            if (nodes && nodes.length == 1) {
              parent.insertBefore(checkbox, anchor);
              if (isDeployed(nodes[0])) {
                checkbox.setAttribute('checked', 'checked');
              }
              checkbox.addEventListener('change',
                                        toggleDeployOnClick(deployedDotDiv, href, environmentName, csrfHeader));
            }
          }
        }
      }
    };
  }

  function maybeAddCheckboxes(environmentName, csrfHeader) {
    var nodes = getElementsByTagAndClass(document, 'div', 'alm-list-view');
    if (nodes && nodes.length == 1) {
      nodes = getElementsByTagAndClass(nodes[0], 'div', 'alm-rows-each');
      Array.prototype.forEach.call(nodes, markupRow(environmentName, csrfHeader));
    }

    // setup the interval once
    if ( ! timerControl) {
      timerControl = setInterval( () => maybeAddCheckboxes(environmentName, csrfHeader), 920);
    }
  }

  function tryFixup() {
    getSelectedEnvironment(maybeAddCheckboxes);
  }

  function progressBar100() {
    var nodes = getElementsByTagAndClass(document, 'div', 'progress-reporter');
    if (nodes && nodes.length == 1) {
      var isDone = nodes[0].style.width.indexOf('100%') >= 0;
      return isDone;
    }
    return false;
  }

  // ====================================================================
  // This kicks off the page fixup logic
  setTimeout(function() {
    mylog('Apigee UE Undeploy tweak running: ' + window.location.href);
    waitForKeyElements("div.alm-list-view", function() {
      mylog('Apigee UE Undeploy - got list view');
      waitForPredicate(progressBar100, function() {
        mylog('Apigee UE Undeploy - progress bar done');
        setTimeout(tryFixup, delayAfterProgressBar);
      });
    });
  }, delayAfterPageLoad);

}(this));
