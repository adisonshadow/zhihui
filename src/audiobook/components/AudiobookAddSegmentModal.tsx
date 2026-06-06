import { useEffect, useMemo } from 'react';
import { Form, Input, Modal, Radio, Select } from 'antd';
import { SegmentType } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';

export type AudiobookAddSegmentPosition = 'above' | 'below';

export type AudiobookAddSegmentFormValues = {
  position: AudiobookAddSegmentPosition;
  type: SegmentType.Narration | SegmentType.Dialogue | SegmentType.InnerVoice;
  character?: string;
  text: string;
};

interface AudiobookAddSegmentModalProps {
  open: boolean;
  segmentIndex: number | null;
  novelScript?: Script | null;
  onClose: () => void;
  onSubmit: (segmentIndex: number, values: AudiobookAddSegmentFormValues) => void;
}

const TYPE_OPTIONS = [
  { value: SegmentType.Narration, label: '旁白' },
  { value: SegmentType.Dialogue, label: '对白' },
  { value: SegmentType.InnerVoice, label: '画外音' },
];

export function AudiobookAddSegmentModal({
  open,
  segmentIndex,
  novelScript,
  onClose,
  onSubmit,
}: AudiobookAddSegmentModalProps) {
  const [form] = Form.useForm<AudiobookAddSegmentFormValues>();

  const segmentType = Form.useWatch('type', form);

  const characterOptions = useMemo(() => {
    const chars = novelScript?.characters ?? [];
    return chars.map((c) => ({
      value: c.id,
      label: `${c.name}（${c.id}）`,
    }));
  }, [novelScript?.characters]);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      position: 'below',
      type: SegmentType.Narration,
      character: undefined,
      text: '',
    });
  }, [open, form, segmentIndex]);

  const needsCharacter =
    segmentType === SegmentType.Dialogue || segmentType === SegmentType.InnerVoice;

  const handleOk = async () => {
    if (segmentIndex == null) return;
    const values = await form.validateFields();
    onSubmit(segmentIndex, values);
    onClose();
  };

  return (
    <Modal
      title="添加片段"
      open={open}
      onCancel={onClose}
      onOk={() => void handleOk()}
      okText="添加"
      cancelText="取消"
      destroyOnHidden
      width={480}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item name="position" label="添加在" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio value="above">本片段上面</Radio>
            <Radio value="below">本片段下面</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="type" label="类型" rules={[{ required: true }]}>
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        {needsCharacter ?
          <Form.Item
            name="character"
            label="角色"
            rules={[{ required: true, message: '请选择或输入角色' }]}
            extra="对白填角色 id；画外音建议选「{名}画外音」专用行"
          >
            {characterOptions.length ?
              <Select
                showSearch
                allowClear
                placeholder="选择角色"
                options={characterOptions}
                optionFilterProp="label"
              />
            : <Input placeholder="角色 id 或名称" />}
          </Form.Item>
        : null}
        <Form.Item name="text" label="朗读文本" rules={[{ required: true, message: '请输入朗读文本' }]}>
          <Input.TextArea autoSize={{ minRows: 4, maxRows: 12 }} placeholder="本段 TTS 朗读正文" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
