// ==UserScript==
// @namespace   Apigee
// @name        toggle-deploy-from-proxies-list
// @description Toggle the deployment state of a proxy from the proxies list in the Apigee Edge Administrative UI (UE version)
// @match       https://apigee.com/organizations/*/proxies
// @grant       none
// @copyright   2019-2020 Google LLC
// @version     0.1.7
// @run-at      document-end
// @license     Apache 2.0
// ==/UserScript==

/* jshint esversion: 9 */
/* global fetch */

(function (globalScope){
  let timerControl = {};
  var delayAfterPageLoad = 800;
  var delayAfterProgressBar = 650;

  function mylog(){
    //Function.prototype.apply.apply(console.log, [console, arguments]);
    // 1. get args as array
    var args = Array.prototype.slice.call(arguments);
    // 2. Prepend log prefix log string
    args.unshift("UE deploy-toggle: ");
    // 3. Pass along arguments to console.log
    console.log.apply(console, args);
  }

  function waitForPredicate(predicate, action, controlKey) {
    controlKey = controlKey || Math.random().toString(36).substring(2,15);
    mylog('waitForPredicate: controlkey= ' + controlKey);
    let interval = timerControl[controlKey];
    mylog('waitForPredicate: interval= ' + interval);
    let found = predicate();

    if (found) {
      mylog('waitForPredicate: found= ' + found);
      action(found);
      if (interval) {
        mylog('waitForPredicate: clearInterval ' + found);
        clearInterval (interval);
        delete timerControl[controlKey];
      }
      else {
        mylog('waitForPredicate: there is no interval set.');
      }
    }
    else {
        if ( ! interval) {
          timerControl[controlKey] = setInterval ( function () {
            waitForPredicate(predicate, action, controlKey);
          }, 300);
        }
    }
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
    let nodes = getElementsByTagAndClass(document, 'div', 'alm-environment-dropdown');
    if (nodes && nodes.length == 1) {
      nodes = getElementsByTagAndClass(nodes[0], 'span', 'dropdown-item');
      if (nodes && nodes.length == 1) {
        let envNode = nodes[0];
        return envNode.textContent;
      }
    }
    return null;
  }

  function getCsrfHeader(cb) {
    let nodes = document.getElementsByTagName('csrf');
    if (nodes && nodes.length == 1) {
      let csrf = nodes[0];
      return csrf.getAttribute('data');
    }
    return null;
  }

  function onSelectEnvironment(event) {
    //event.preventDefault();
    setTimeout( function() {
      let nodes = getElementsByTagAndClass(document, 'div', 'alm-list-view');
      if (nodes && nodes.length == 1) {
        nodes = getElementsByTagAndClass(nodes[0], 'div', 'alm-rows-each');
        Array.prototype.forEach.call(nodes, function(rowNode) {
          let nodes = getElementsByTagAndClass(rowNode, 'a', 'row-anchor-tag');
          if (nodes && nodes.length == 1) {
            let anchor = nodes[0],
                parent = anchor.parentNode;
            if (parent.firstChild.nodeName.toUpperCase() == 'INPUT') {
              // checkbox is the first element, set its status correctly
              let checkbox = parent.firstChild,
                  href = anchor.getAttribute('href'); // eg, /platform/gaccelerate3/proxies/linebreaks/overview/5
              nodes = getElementsByTagAndClass(anchor, 'div', 'deployedDot');
              if (nodes && nodes.length == 1) {
                let deployedDotDiv = nodes[0];
                nodes = getElementsByTagAndClass(deployedDotDiv, 'div', 'progress-bar');
                if (nodes && nodes.length == 1) {
                  // The deployedstatus dot is already set by the page.
                  // Just make sure the checkbox is synchronized.
                  let thisProxyIsDeployed = isDeployed(nodes[0]);
                  if (thisProxyIsDeployed) {
                    checkbox.setAttribute('checked', 'checked');
                  }
                  else {
                    checkbox.removeAttribute('checked');
                  }
                }
              }
            }
          }
        });
        addEnvironmentSelectorHandler();
      }

    }, 930); // delay to allow page to update deployed status
    return true;
  }

  function addEnvironmentSelectorHandler() {
    let nodes = getElementsByTagAndClass(document, 'div', 'alm-environment-dropdown');
    if (nodes && nodes.length == 1) {
      mylog('found dropdown');
      nodes = getElementsByTagAndClass(nodes[0], 'a', 'dropdown-item');
      Array.prototype.forEach.call(nodes, (anchor) => {
        anchor.addEventListener('click', onSelectEnvironment);
      });
    }
    else {
      mylog('no dropdown?');
    }
  }

  function isDeployed(elt) {
    if (elt.style && elt.style.width) {
      return elt.style.width.indexOf('100%') >= 0;
    }
    return false;
  }

  function toggleDeployOnClick(div, href, csrfHeader) {
    return function(event) {
      let environmentName = getSelectedEnvironment(),
          checkbox = event.currentTarget, // this
          parts = href.split('/'),
          orgname = parts[2],
          apiname = parts[4],
          rev = parts[6];

      // event.preventDefault();
      // event.stopPropagation();
      let nodes = getElementsByTagAndClass(div, 'div', 'progress-bar');
      if (nodes && nodes.length == 1) {
        let progressBar = nodes[0],
            baseHeaders = {
              'Accept': 'application/json',
              'X-Apigee-CSRF': csrfHeader,
              'X-Requested-With': 'XMLHttpRequest',
              'X-Restart-URL': 'https://apigee.com' + href
            };

        if(checkbox.checked) {
          if ( ! isDeployed(progressBar)) {
            mylog('deploying latest...');
            let url = `https://apigee.com/ws/proxy/organizations/${orgname}/e/${environmentName}/apis/${apiname}/revisions/${rev}/deployments`,
                headers = {...baseHeaders, 'Content-type': 'application/x-www-form-urlencoded'},
                body = 'override=true';

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
            let getUrl = `https://apigee.com/ws/proxy/organizations/${orgname}/e/${environmentName}/apis/${apiname}/deployments`;
            // $mgmtserver/v1/o/$ORG/e/$ENV/apis/$API/deployments
            mylog('finding deployed revision...');
            return fetch(getUrl, { method:'GET', headers: baseHeaders })
              .then( res =>
                     (res.status != 200) ? null :
                     res.json()
                     .then(body => {
                       //console.log(JSON.stringify(body.revision, null, 2));
                       if (body.revision && body.revision[0] && body.revision[0].name) {
                         let url = `https://apigee.com/ws/proxy/organizations/${orgname}/e/${environmentName}/apis/${apiname}/revisions/${body.revision[0].name}/deployments`;
                         mylog('undeploying...');
                         return fetch(url, { method:'DELETE', headers: baseHeaders })
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
                       else {
                         mylog('the proxy does not seem to be deployed.');
                         return null;
                       }
                     })
                   );
          }
        }
      }
      return null;
    };
  }

  function markupRow(csrfHeader) {
    return function(rowNode) {
      var nodes = getElementsByTagAndClass(rowNode, 'a', 'row-anchor-tag');
      if (nodes && nodes.length == 1) {
        let anchor = nodes[0],
            parent = anchor.parentNode;
        if (parent.firstChild.nodeName.toUpperCase() != 'INPUT') {
          // checkbox is not first element, so add one
          let href = anchor.getAttribute('href'), // eg, /platform/ORG/proxies/API/overview/REVISION
              checkbox = document.createElement('input');
          checkbox.innerHTML = '';
          checkbox.setAttribute('type', 'checkbox');
          checkbox.setAttribute('title', 'deployment status');
          checkbox.setAttribute('style', 'position: absolute; top: 20px; left:10px; z-index:5;');
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
                                        toggleDeployOnClick(deployedDotDiv, href, csrfHeader));
            }
          }
        }
      }
    };
  }

  function maybeAddCheckboxes() {
    var nodes = getElementsByTagAndClass(document, 'div', 'alm-list-view');
    if (nodes && nodes.length == 1) {
      nodes = getElementsByTagAndClass(nodes[0], 'div', 'alm-rows-each');
      let csrfHeader = getCsrfHeader();
      Array.prototype.forEach.call(nodes, markupRow(csrfHeader));
    }

    // setup the interval once
    if ( ! timerControl.relook) {
      mylog('initiating relook interval');
      timerControl.relook = setInterval( maybeAddCheckboxes, 1120);
    }
  }

  function tryFixup() {
    mylog('try fixup');
    addEnvironmentSelectorHandler();
    maybeAddCheckboxes();
  }

  function progressBar100() {
    var nodes = getElementsByTagAndClass(document, 'div', 'progress-reporter');
    if (nodes && nodes.length == 1) {
      var isDone = nodes[0].style.width.indexOf('100%') >= 0;
      return isDone;
    }
    return false;
  }

  function almListView() {
    var nodes = getElementsByTagAndClass(document, 'div', 'alm-list-view');
    return (nodes && nodes.length == 1);
  }

  // ====================================================================
  // This kicks off the page fixup logic
  setTimeout(function() {
    mylog('tweak running: ' + window.location.href);
    waitForPredicate(almListView, function() {
      mylog('got list view');
      waitForPredicate(progressBar100, function() {
        mylog('progress bar done');
        setTimeout(tryFixup, delayAfterProgressBar);
      });
    });
  }, delayAfterPageLoad);

}(this));
