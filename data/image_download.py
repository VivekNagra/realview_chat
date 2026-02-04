#!/usr/bin/python3
import sys
import hmac
import json
import pprint
import urllib.request
import urllib.parse
import importlib
import time
import copy
import os
import sys


CONSUMER="students26a"
KEY="fvliSm028Bq9"
ENDPOINT="https://service25.realview.dk/v3"


def calc_hmac(key, instr):
    h = hmac.new(key=key.encode("utf8"),digestmod="sha256")
    h.update(instr.encode("utf8"))
    return h.hexdigest()

def envelope_request(args,consumer, query, hmac):
    env = {}
    env["hmac"]=hmac
    env["consumer"]=consumer
    env["query"]=query
    if args is not None and args.deviceid is not None:
        env["device_id"]=args.deviceid

    if args is not None and args.sessionid is not None:
        env["session_id"]=args.sessionid
    
    if args is not None and args.queryid is not None:
        env["query_id"]=args.queryid

    data = urllib.parse.urlencode(env).encode("utf8")
    return data

def send_query(endpoint, data):
    reqstart = time.time()
    uo = urllib.request.urlopen(endpoint,data)
    data = uo.read()
    sys.stderr.write("HTTP: " + str(uo.code) + " " + uo.getheader('Content-Type') + "\n")
    reqtime = time.time() - reqstart
    reqbytes = len(data)
    jsondata = data.decode("utf8")
    response = json.loads(jsondata)

    sys.stderr.write("Response (QID={qid}) {bytes:,} bytes in {seconds:.3} seconds\n".format(qid=response["query_log_id"],seconds=reqtime,bytes=reqbytes))
    sys.stderr.write("Logical: " + str(response['status']))
    if 'status_explained' in response.keys():
        sys.stderr.write(" " + response["status_explained"])
    sys.stderr.write("\n")

    sys.stderr.write(response["query"] + "\n\n")
    return response

def handle_response(response):
    if 'data' in response.keys():
        nowtime =  time.strftime("%Y-%m-%d_%H-%M-%S")
        # print(json.dumps(response['data'], indent=4))

        # Download images to case folder
        data = response['data']
        for case_key, case_list in data.items():
            if case_key.startswith("case_"):
                folder_name = case_key
                os.makedirs(folder_name, exist_ok=True)

                for case_data in case_list:
                    if 'images' in case_data:
                        for img_url in case_data['images']:
                            if img_url.endswith('.jpg'):
                                filename = img_url.split('/')[-1]
                                filepath = os.path.join(folder_name, filename)
                                sys.stderr.write(f"Downloading {filename}...\n")
                                urllib.request.urlretrieve(img_url, filepath)

                sys.stderr.write(f"Downloaded images to {folder_name}/\n")

def main():
    case_id = int(sys.argv[1])
    query = json.dumps({"function":"imagelist","target":[{"case_id":case_id,"id":f"case_{case_id}"}],"req_size":"1920x1080","front_image_handle":1})

    query_hmac = calc_hmac(KEY, query)
    data = envelope_request(None,CONSUMER, query, query_hmac)

    response = send_query(ENDPOINT, data)
    handle_response(response)


if __name__ == '__main__': main()
