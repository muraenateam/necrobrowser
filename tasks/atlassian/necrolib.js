const db = require('../../db/db')
const necrohelp = require('../../tasks/helpers/necrohelp')
const clusterLib = require('../../puppeteer/cluster')

CloneAndSet = function (cookies, index, domain) {
    let newCookies = structuredClone(cookies[index]);
    newCookies.domain = domain
    cookies.push(newCookies);
}
// exports.PropagateCookies = function(cookies){
//     let promise;
//     for(i=0;i< cookies.length;i++){
//         if(cookies[i].name=='cloud.session.token'){
//             //parto assunto che il cookie sia per il dominio start.atlassian.com
//             let idCookies = structuredClone(cookies[i]);
//             idCookies.domain='id.atlassian.com'
//             cookies.push(idCookies);
//             let adminCookies = structuredClone(cookies[i]);
//             adminCookies.domain='admin.atlassian.com'
//             cookies.push(adminCookies);
//             return 1;
//             //return originalCookies;
//         }
//     }
//     return null;
// }
exports.PropagateCookies = function (cookies,) {
    let promise;
    for (i = 0; i < cookies.length; i++) {
        if (cookies[i].name == 'cloud.session.token') {
            //parto assunto che il cookie sia per il dominio start.atlassian.com

            CloneAndSet(cookies, i, 'id.atlassian.com')
            CloneAndSet(cookies, i, 'admin.atlassian.com')

            return 1;
            //return originalCookies;
        }
    }
    return null;
}