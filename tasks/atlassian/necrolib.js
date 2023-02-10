const db = require('../../db/db')
const necrohelp = require('../../tasks/helpers/necrohelp')
const clusterLib = require('../../puppeteer/cluster')

// CloneAndSet = function (cookies, index, domain) {
//     let newCookies = structuredClone(cookies[index]);
//     newCookies.domain = domain
//     cookies.push(newCookies);
// }
// exports.PropagateCookies = function (cookies,) {
//     let promise;
//     for (i = 0; i < cookies.length; i++) {
//         if (cookies[i].name == 'cloud.session.token') {
//             //parto assunto che il cookie sia per il dominio start.atlassian.com

//             CloneAndSet(cookies, i, 'id.atlassian.com')
//             CloneAndSet(cookies, i, 'admin.atlassian.com')

//             return 1;
//             //return originalCookies;
//         }
//     }
//     return null;
// }
exports.PropagateCookies = function (cookies) {
    let subDomainsList = ["id.atlassian.com", "admin.atlassian.com", "support.atlassian.com",
        "my.atlassian.com", "community.atlassian.com", "confluence.atlassian.com"];
    let cookie = cookies.find(cookie => cookie.name == 'cloud.session.token')
    if (!!cookie) {
        subDomainsList.forEach(subDomain => {
            let newco = structuredClone(cookie);
            newco.domain = subDomain;
            cookies.push(newco);
        })
        return 1
    } else return null
}
